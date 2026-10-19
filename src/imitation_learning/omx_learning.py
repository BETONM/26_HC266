#!/usr/bin/env python3
"""Local ACT training for the v2.1 OMX dataset.

Examples:
    python omx_learning.py --smoke --state-only --gpu 0
    python omx_learning.py --state-only --gpu 0
    python omx_learning.py --resume
    python omx_learning.py --dataset-root data/omx_dual_opening_v2 --exclude-episodes 0,1,6 --gpu 0
"""

import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_DATASET = PROJECT_ROOT / "leader-control" / "omx_trajectory"
TRAIN_ROOT = PROJECT_ROOT / "outputs" / "train"
ENV_STATE = "observation.environment_state"
NORMALIZATION = {key: "MEAN_STD" for key in ["VISUAL", "STATE", "ENV", "ACTION"]}


def positive_int(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("1 이상의 정수를 입력하세요.")
    return number


def episode_list(value):
    try:
        episodes = sorted({int(item) for item in value.split(",") if item.strip()})
    except ValueError:
        raise argparse.ArgumentTypeError("쉼표로 구분한 에피소드 번호를 입력하세요. 예: 0,1,6") from None
    if not episodes or episodes[0] < 0:
        raise argparse.ArgumentTypeError("0 이상의 에피소드 번호를 입력하세요.")
    return episodes


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--smoke", action="store_true", help="200 step 실행 확인")
    mode.add_argument("--resume", nargs="?", const="last", metavar="RUN_OR_CONFIG",
                      help="학습 폴더 또는 train_config.json에서 재개 (기본: 본 학습 폴더)")
    parser.add_argument("--dataset-root", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--dataset-repo-id", default="local/omx_trajectory",
                        help="로컬 데이터의 식별자. Hub 업로드나 로그인은 필요 없음")
    parser.add_argument("--output-dir", type=Path, help="기본: outputs/train/omx_act_v1 또는 smoke")
    parser.add_argument("--steps", type=positive_int, help="기본: 40000, smoke: 200; resume 시 총 목표 step")
    parser.add_argument("--batch-size", type=positive_int, help="기본: 8")
    parser.add_argument("--save-freq", type=positive_int, help="기본: 2000, smoke: 100")
    parser.add_argument("--num-workers", type=int, help="기본: 4, smoke: 2; 0도 가능")
    parser.add_argument("--device", choices=["cuda", "cpu"], help="기본: cuda; resume은 저장된 값 유지")
    parser.add_argument("--gpu", type=int, help="사용할 물리 GPU 번호. 생략 시 CUDA_VISIBLE_DEVICES 유지")
    parser.add_argument("--state-only", action="store_true",
                        help="카메라 없는 데이터의 관절 상태를 ACT 환경 상태 입력으로 복사")
    parser.add_argument("--exclude-episodes", type=episode_list, metavar="0,1,6",
                        help="제외한 에피소드만 번호를 다시 매겨 별도 폴더에 복사한 뒤 학습")
    parser.add_argument("--chunk-size", type=positive_int, help="ACT action chunk 길이 (기본: LeRobot 100)")
    parser.add_argument("--n-action-steps", type=positive_int, help="추론 시 chunk에서 실행할 step 수 (기본: chunk와 동일)")
    parser.add_argument("--amp", action="store_true", help="Automatic Mixed Precision 사용")
    parser.add_argument("--seed", type=int, help="기본: LeRobot 1000")
    parser.add_argument("--policy-repo-id", help="명시한 경우에만 학습 모델을 HF Hub에 업로드")
    parser.add_argument("--dry-run", action="store_true", help="명령 출력만 수행 (데이터 복사 및 학습 없음)")
    args = parser.parse_args()
    if args.num_workers is not None and args.num_workers < 0:
        parser.error("--num-workers는 0 이상이어야 합니다.")
    if args.gpu is not None and args.gpu < 0:
        parser.error("--gpu는 0 이상이어야 합니다.")
    if args.state_only and args.exclude_episodes:
        parser.error("--state-only와 --exclude-episodes는 함께 사용할 수 없습니다.")
    if args.resume and (args.state_only or args.exclude_episodes or args.policy_repo_id
                        or args.chunk_size or args.n_action_steps or args.amp or args.seed is not None):
        parser.error("재개 시 데이터 변환, 정책, Hub 설정은 저장된 설정을 사용합니다.")
    return args


def load_dataset_info(root):
    for name in ["info.json", "episodes.jsonl", "episodes_stats.jsonl", "tasks.jsonl"]:
        if not (root / "meta" / name).is_file():
            raise ValueError(f"데이터셋 파일이 없습니다: {root / 'meta' / name}")
    info = json.loads((root / "meta/info.json").read_text())
    if info.get("codebase_version") != "v2.1":
        raise ValueError("이 스크립트는 노트북과 같은 LeRobot v2.1 데이터셋을 사용합니다.")
    if info.get("total_frames", 0) < 1 or "action" not in info["features"]:
        raise ValueError("action이 포함된 비어 있지 않은 데이터셋이 필요합니다.")
    for line in (root / "meta/episodes.jsonl").read_text().splitlines():
        episode = json.loads(line)["episode_index"]
        relative = info["data_path"].format(
            episode_chunk=episode // info["chunks_size"], episode_index=episode
        )
        if not (root / relative).is_file():
            raise ValueError(f"에피소드 데이터가 없습니다: {root / relative}")
        for key, feature in info["features"].items():
            if feature["dtype"] == "video":
                video = info["video_path"].format(
                    episode_chunk=episode // info["chunks_size"], episode_index=episode, video_key=key
                )
                if not (root / video).is_file():
                    raise ValueError(f"카메라 영상이 없습니다: {root / video}")
    return info


def prepare_state_only_dataset(source, target, info):
    """Copy joint states to a separate dataset's ACT environment-state input.

    This adds no object positions or other environmental information.
    At inference, also supply observation.environment_state = observation.state.
    """
    import pyarrow.parquet as pq

    if target.exists():
        raise ValueError(f"변환 데이터 폴더가 이미 있습니다: {target}. 새 --output-dir를 지정하세요.")
    if target.is_relative_to(source):
        raise ValueError("변환 데이터 폴더를 원본 데이터 폴더 안에 만들 수 없습니다.")
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="omx-state-", dir=target.parent) as temporary:
        converted = Path(temporary) / "dataset"
        shutil.copytree(source, converted, ignore=shutil.ignore_patterns(".git", ".cache"))
        updated = copy.deepcopy(info)
        updated["features"][ENV_STATE] = copy.deepcopy(info["features"]["observation.state"])
        (converted / "meta/info.json").write_text(json.dumps(updated, indent=4) + "\n")
        stats_file = converted / "meta/episodes_stats.jsonl"
        records = []
        for line in stats_file.read_text().splitlines():
            record = json.loads(line)
            record["stats"][ENV_STATE] = copy.deepcopy(record["stats"]["observation.state"])
            records.append(json.dumps(record))
        stats_file.write_text("\n".join(records) + "\n")
        for parquet in sorted((converted / "data").rglob("*.parquet")):
            table = pq.read_table(parquet)
            table = table.append_column(ENV_STATE, table["observation.state"])
            # The original Hugging Face schema does not describe the added column.
            metadata = dict(table.schema.metadata or {})
            metadata.pop(b"huggingface", None)
            pq.write_table(table.replace_schema_metadata(metadata), parquet)
        converted.rename(target)
    return target


def prepare_subset_dataset(source, target, info, excluded):
    """Copy the dataset without the excluded episodes, renumbering the rest from 0.

    LeRobot's --dataset.episodes looks up episode boundaries by the original episode
    number, which breaks action chunks when episodes in the middle are skipped.
    """
    import pyarrow as pa
    import pyarrow.parquet as pq

    if target.exists():
        raise ValueError(f"변환 데이터 폴더가 이미 있습니다: {target}. 새 --output-dir를 지정하세요.")
    if target.is_relative_to(source):
        raise ValueError("변환 데이터 폴더를 원본 데이터 폴더 안에 만들 수 없습니다.")
    episodes = [json.loads(line) for line in (source / "meta/episodes.jsonl").read_text().splitlines()]
    stats = {record["episode_index"]: record
             for record in map(json.loads, (source / "meta/episodes_stats.jsonl").read_text().splitlines())}
    kept = [episode for episode in episodes if episode["episode_index"] not in excluded]
    video_keys = [key for key, feature in info["features"].items() if feature["dtype"] == "video"]
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="omx-subset-", dir=target.parent) as temporary:
        converted = Path(temporary) / "dataset"
        (converted / "meta").mkdir(parents=True)
        shutil.copy2(source / "meta/tasks.jsonl", converted / "meta/tasks.jsonl")
        episode_lines, stats_lines, start = [], [], 0
        for new, episode in enumerate(kept):
            old, length = episode["episode_index"], episode["length"]

            def path(template, index, **keys):
                return template.format(episode_chunk=index // info["chunks_size"], episode_index=index, **keys)

            table = pq.read_table(source / path(info["data_path"], old))
            table = table.set_column(table.schema.get_field_index("episode_index"), "episode_index",
                                     pa.array([new] * len(table), pa.int64()))
            table = table.set_column(table.schema.get_field_index("index"), "index",
                                     pa.array(range(start, start + len(table)), pa.int64()))
            (converted / path(info["data_path"], new)).parent.mkdir(parents=True, exist_ok=True)
            pq.write_table(table, converted / path(info["data_path"], new))
            for key in video_keys:
                video = converted / path(info["video_path"], new, video_key=key)
                video.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source / path(info["video_path"], old, video_key=key), video)
            record = copy.deepcopy(stats[old])
            record["episode_index"] = new
            record["stats"]["episode_index"].update(min=[new], max=[new], mean=[float(new)])
            record["stats"]["index"].update(min=[start], max=[start + length - 1],
                                            mean=[start + (length - 1) / 2])
            episode_lines.append(json.dumps({**episode, "episode_index": new}, ensure_ascii=False))
            stats_lines.append(json.dumps(record))
            start += length
        (converted / "meta/episodes.jsonl").write_text("\n".join(episode_lines) + "\n")
        (converted / "meta/episodes_stats.jsonl").write_text("\n".join(stats_lines) + "\n")
        updated = copy.deepcopy(info)
        updated.update(total_episodes=len(kept), total_frames=start, total_videos=len(kept) * len(video_keys),
                       total_chunks=(len(kept) - 1) // info["chunks_size"] + 1, splits={"train": f"0:{len(kept)}"})
        (converted / "meta/info.json").write_text(json.dumps(updated, indent=4, ensure_ascii=False) + "\n")
        converted.rename(target)
    return target


def build_command(args):
    output = (args.output_dir or TRAIN_ROOT / ("smoke" if args.smoke else "omx_act_v1")).expanduser().resolve()
    command = [sys.executable, "-m", "lerobot.scripts.train"]
    conversion = None
    if args.resume:
        config = output if args.resume == "last" else Path(args.resume).expanduser().resolve()
        if config.is_dir():
            config = config / "checkpoints/last/pretrained_model/train_config.json"
        if not config.is_file():
            raise ValueError(f"재개할 체크포인트 설정이 없습니다: {config}")
        saved = json.loads(config.read_text())
        load_dataset_info(Path(saved["dataset"]["root"]))
        command += [f"--config_path={config}", "--resume=true"]
        for option in ["steps", "batch_size", "save_freq", "num_workers"]:
            if (value := getattr(args, option)) is not None:
                command.append(f"--{option}={value}")
        if args.device:
            command.append(f"--policy.device={args.device}")
        device = args.device or saved["policy"]["device"]
    else:
        if output.exists():
            raise ValueError(f"출력 폴더가 이미 있습니다: {output}. --resume 또는 새 --output-dir를 사용하세요.")
        root = args.dataset_root.expanduser().resolve()
        info = load_dataset_info(root)
        features = info["features"]
        has_images = any(feature["dtype"] in ["image", "video"] for feature in features.values())
        if args.state_only:
            if has_images or ENV_STATE in features or "observation.state" not in features:
                raise ValueError("--state-only는 관절 상태만 있고 이미지/환경 상태 입력은 없는 데이터에 사용하세요.")
            converted = output.with_name(output.name + "_state_only_dataset")
            if converted.exists():
                raise ValueError(f"변환 데이터 폴더가 이미 있습니다: {converted}. 새 --output-dir를 지정하세요.")
            conversion = (prepare_state_only_dataset, root, converted, info)
            root = converted
            print("관절 전용 학습: 환경 상태 입력에 관절 상태를 복사합니다. 추론에도 같은 입력이 필요합니다.")
        elif not has_images and ENV_STATE not in features:
            raise ValueError("ACT는 이미지 또는 환경 상태 입력이 필요합니다. 현재 관절 데이터에는 --state-only를 사용하세요.")
        if args.exclude_episodes:
            missing = [episode for episode in args.exclude_episodes if episode >= info["total_episodes"]]
            if missing:
                raise ValueError(f"데이터셋에 없는 에피소드입니다: {missing} (전체 {info['total_episodes']}개)")
            if len(args.exclude_episodes) == info["total_episodes"]:
                raise ValueError("모든 에피소드를 제외할 수 없습니다.")
            subset = output.with_name(output.name + "_dataset")
            if subset.exists():
                raise ValueError(f"변환 데이터 폴더가 이미 있습니다: {subset}. 새 --output-dir를 지정하세요.")
            conversion = (prepare_subset_dataset, root, subset, info, set(args.exclude_episodes))
            root = subset
            print(f"에피소드 {args.exclude_episodes} 제외: 나머지 "
                  f"{info['total_episodes'] - len(args.exclude_episodes)}개를 0번부터 다시 번호 매겨 복사합니다.")
        if info["total_episodes"] == 1:
            print("참고: 시연 1개입니다. 학습 실행 확인용이며 다양한 상황에서의 성능은 검증되지 않았습니다.")
        device = args.device or "cuda"
        defaults = {"steps": 200 if args.smoke else 40000, "batch_size": 8,
                    "save_freq": 100 if args.smoke else 2000, "num_workers": 2 if args.smoke else 4}
        command += [f"--dataset.repo_id={args.dataset_repo_id}", f"--dataset.root={root}",
                    "--policy.type=act", f"--policy.device={device}",
                    f"--output_dir={output}", f"--job_name={output.name}", "--wandb.enable=false"]
        if args.state_only:
            command.append(f"--policy.normalization_mapping={json.dumps(NORMALIZATION)}")
        for option, default in defaults.items():
            value = getattr(args, option)
            command.append(f"--{option}={default if value is None else value}")
        for option in ["chunk_size", "n_action_steps"]:
            if (value := getattr(args, option)) is not None:
                command.append(f"--policy.{option}={value}")
        if args.amp:
            command.append("--policy.use_amp=true")
        if args.seed is not None:
            command.append(f"--seed={args.seed}")
        command.append(f"--policy.push_to_hub={str(bool(args.policy_repo_id)).lower()}")
        if args.policy_repo_id:
            command.append(f"--policy.repo_id={args.policy_repo_id}")
    return command, conversion, device


def main():
    args = parse_args()
    try:
        command, conversion, device = build_command(args)
        environment = os.environ.copy()
        if args.gpu is not None:
            environment["CUDA_VISIBLE_DEVICES"] = str(args.gpu)
        print("실행 명령:", shlex.join(command), flush=True)
        if args.gpu is not None:
            print(f"CUDA_VISIBLE_DEVICES={args.gpu}", flush=True)
        if args.dry_run:
            return 0
        if importlib.util.find_spec("lerobot") is None or importlib.util.find_spec("torch") is None:
            raise ValueError("현재 Python에 LeRobot/PyTorch가 없습니다. README의 로컬 학습 환경 설치를 진행하세요.")
        check = subprocess.run(
            [sys.executable, "-c", "import torch; import lerobot.scripts.train; "
             + ("assert torch.cuda.is_available(), 'CUDA GPU를 사용할 수 없습니다'" if device == "cuda" else "pass")],
            env=environment,
        )
        if check.returncode:
            raise ValueError("LeRobot import 또는 GPU 확인에 실패했습니다. 위 오류와 Python 환경을 확인하세요.")
        if conversion:
            conversion[0](*conversion[1:])
        return subprocess.run(command, env=environment).returncode
    except (ValueError, OSError, KeyError, ImportError) as error:
        print(f"오류: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
