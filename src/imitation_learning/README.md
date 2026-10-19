# OMX Imitation Learning

ROBOTIS OMX-L Leader와 OMX-F Follower를 LeRobot으로 제어하는 프로젝트입니다.

## Current Progress

현재 다음 기능을 구현했습니다.

### Teleoperation

OMX-L Leader 로봇팔을 손으로 움직이면 OMX-F Follower 로봇팔이 실시간으로 동일한 움직임을 따라갑니다.

### Trajectory Recording

Leader를 이용해 Follower를 조작하면서 로봇 관절 상태와 제어 action을 LeRobot 데이터셋 형식으로 저장할 수 있습니다.

### Trajectory Replay

저장된 관절 궤적을 불러와 Leader 없이 OMX-F Follower에서 동일한 움직임을 다시 실행할 수 있습니다.

현재 저장된 데이터셋에는 카메라 영상이 포함되어 있지 않으며, 로봇의 관절 상태와 action을 기반으로 한 고정 궤적 재생을 수행합니다.

## Repository Structure

```text
ImitationLearning/
├── README.md
├── omx_learning.py
├── requirements-training.txt
└── leader-control/
    └── omx_trajectory/
```

## Environment

* Ubuntu 24.04
* ROBOTIS OMX-L Leader
* ROBOTIS OMX-F Follower
* LeRobot
* Dynamixel SDK
* Python virtual environment

## Activate Environment

```bash
cd ~/lerobot
source .venv/bin/activate
unset PYTHONPATH

export HF_LEROBOT_HOME=/opt/lerobot-data/lerobot
```

## Teleoperation

OMX-L Leader의 움직임을 OMX-F Follower가 실시간으로 따라가도록 실행합니다.

```bash
python -m lerobot.teleoperate \
  --robot.type=omx_follower \
  --robot.port=/dev/ttyACM0 \
  --robot.id=omx_follower_arm \
  --teleop.type=omx_leader \
  --teleop.port=/dev/ttyACM1 \
  --teleop.id=omx_leader_arm
```

종료하려면 `Ctrl+C`를 입력합니다.

## Record Trajectory

기존 데이터셋을 삭제하고 새로운 관절 궤적을 기록합니다.

```bash
rm -rf /opt/lerobot-data/lerobot/gamzadole/omx_trajectory

python -m lerobot.record \
  --robot.type=omx_follower \
  --robot.port=/dev/ttyACM0 \
  --robot.id=omx_follower_arm \
  --teleop.type=omx_leader \
  --teleop.port=/dev/ttyACM1 \
  --teleop.id=omx_leader_arm \
  --dataset.repo_id=gamzadole/omx_trajectory \
  --dataset.num_episodes=1 \
  --dataset.episode_time_s=30 \
  --dataset.reset_time_s=5 \
  --dataset.single_task="Replay recorded trajectory" \
  --dataset.push_to_hub=false
```

기록 중 사용할 수 있는 키는 다음과 같습니다.

* 오른쪽 방향키: 현재 에피소드 저장 및 완료
* 왼쪽 방향키: 현재 에피소드 취소 후 다시 기록
* `ESC`: 전체 기록 종료
* `Ctrl+C`: 긴급 종료

## Replay Trajectory

저장된 첫 번째 관절 궤적을 OMX-F Follower에서 재생합니다.

```bash
python -m lerobot.replay \
  --robot.type=omx_follower \
  --robot.port=/dev/ttyACM0 \
  --robot.id=omx_follower_arm \
  --dataset.repo_id=gamzadole/omx_trajectory \
  --dataset.episode=0
```

재생 전에 Follower를 기록 당시의 시작 자세와 비슷하게 배치해야 합니다.

현재 자세와 저장된 첫 번째 관절 자세의 차이가 크면 재생 시작 시 로봇팔이 빠르게 움직일 수 있습니다.

## Dataset

현재 기록한 LeRobot 데이터셋은 다음 경로에 포함되어 있습니다.

```text
leader-control/omx_trajectory/
```

이 데이터셋은 카메라 없이 수집한 관절 기반 데이터셋으로 다음 정보를 포함합니다.

* OMX-F Follower 관절 상태
* OMX-L Leader로 생성한 제어 action
* Timestamp
* Episode metadata

## Local ACT Training

`omx_learning.py`는 Colab/Google Drive 없이 로컬 데이터로 ACT를 학습합니다. 기본 입력은 스크립트 위치 기준 `leader-control/omx_trajectory/`, 기본 출력은 `outputs/train/`입니다. 실행하는 현재 디렉터리에 영향을 받지 않습니다. 기본 학습에는 Hugging Face 계정이나 데이터 업로드가 필요하지 않습니다.

### Install training environment

현재 기본 Python은 3.13이며 LeRobot/PyTorch가 설치되어 있지 않습니다. 기존 로봇 제어 환경과 분리하여 프로젝트 안에 Python 3.11 학습 환경을 만드세요.

```bash
cd /home/jgshin22/work/LabBot/ImitationLearning
conda create --prefix ./.venv -c conda-forge python=3.11 "ffmpeg=6" -y
conda activate ./.venv
python -m pip install -r requirements-training.txt
```

LeRobot은 노트북과 같은 commit `989f3d05ba47f872d75c587e76838e9cc574857a`으로 고정합니다. PyTorch 2.7.1, torchvision 0.22.1, TorchCodec 0.5.0도 고정합니다. [TorchCodec의 공식 호환표](https://github.com/pytorch/torchcodec#compatibility-with-torch-versions)를 기준으로 조합을 맞췄습니다. 이 commit에는 `act` 추가 설치 그룹이 없어 기본 LeRobot 패키지를 설치합니다. Git LFS가 없는 환경에서도 설치할 수 있도록 Git clone 대신 동일 commit의 소스 압축파일을 사용합니다.

### Run with the included joint-only dataset

현재 데이터는 시연 1개, 892프레임이며 이미지가 없습니다. [이 ACT 버전의 입력 검사](https://github.com/huggingface/lerobot/blob/989f3d05ba47f872d75c587e76838e9cc574857a/src/lerobot/policies/act/configuration_act.py)에는 이미지 또는 `observation.environment_state`가 필요하므로 관절 데이터에는 `--state-only`를 명시해야 합니다.

이 옵션은 원본을 별도 폴더에 복사하고 `observation.state`와 같은 값을 `observation.environment_state` 열에 추가합니다. feature 정보와 정규화 통계도 함께 추가합니다. 이는 관절 입력만으로 학습 실행을 확인하기 위한 구성으로, 물체 위치 등의 환경 정보가 새로 생기는 것은 아닙니다. **이 모델을 추론에 사용할 때도 두 입력에 동일한 관절 상태를 제공해야 합니다.**

```bash
# 명령과 경로 확인: 데이터 복사 및 학습 없음
python omx_learning.py --smoke --state-only --gpu 0 --dry-run

# 200 step 실행 확인 (batch 8, 100 step마다 저장)
python omx_learning.py --smoke --state-only --gpu 0

# 본 학습 (노트북과 같은 40000 step, 2000 step마다 저장)
python omx_learning.py --state-only --gpu 0
```

`--gpu 0`은 물리 GPU 0번을 선택합니다. GPU 번호를 생략하면 기존 `CUDA_VISIBLE_DEVICES` 설정을 따릅니다. 이 스크립트는 GPU 1개로 학습합니다. 현재 시연 1개만으로 다양한 상황에서의 성능을 판단할 수는 없으므로, 본 학습에 앞서 시연을 추가 수집하는 것이 좋습니다.

| 실행 | 체크포인트 출력 | 관절 데이터 변환본 |
| --- | --- | --- |
| Smoke | `outputs/train/smoke/` | `outputs/train/smoke_state_only_dataset/` |
| 본 학습 | `outputs/train/omx_act_v1/` | `outputs/train/omx_act_v1_state_only_dataset/` |

기존 출력 또는 변환 폴더가 있으면 덮어쓰지 않습니다. 새 학습은 `--output-dir outputs/train/omx_act_v2`처럼 다른 폴더를 지정하세요. 변환 데이터는 재개할 때도 필요하므로 해당 학습이 끝날 때까지 보관하세요.

### Resume and change settings

```bash
# 마지막 본 학습 체크포인트에서 재개
python omx_learning.py --resume --gpu 0

# Smoke 체크포인트를 총 1000 step까지 이어서 실행
python omx_learning.py --resume outputs/train/smoke --steps 1000 --gpu 0

# 메모리가 부족하면 batch를 줄이고, 데이터 로더 문제 시 worker를 0으로 설정
python omx_learning.py --state-only --batch-size 4 --num-workers 0 \
  --output-dir outputs/train/omx_act_small --gpu 0
```

재개는 `checkpoints/last/pretrained_model/train_config.json`을 읽어 데이터 경로와 학습 설정을 복원합니다. `--steps`는 추가 step 수가 아닌 **전체 목표 step 수**입니다. `--resume`에는 학습 폴더 또는 `train_config.json` 경로를 지정할 수 있습니다. `--steps`, `--batch-size`, `--save-freq`, `--num-workers`, `--device`를 생략하면 저장된 설정을 유지합니다.

카메라가 있는 v2.1 데이터를 수집한 뒤에는 `--state-only`를 빼고 실제 데이터 경로를 지정하세요.

```bash
python omx_learning.py --dataset-root /path/to/camera_dataset \
  --output-dir outputs/train/omx_act_camera --gpu 0
```

모델을 Hugging Face Hub에 올리려면 쓰기 권한으로 로그인한 뒤 `--policy-repo-id 사용자명/모델명`을 명시하세요. `python omx_learning.py --help`에서 전체 옵션을 확인할 수 있습니다.

## Future Work

향후 카메라를 추가하면 단순한 고정 궤적 재생을 넘어 시각 기반 모방학습으로 확장할 수 있습니다.

구현 예정 기능은 다음과 같습니다.

* 카메라 영상과 로봇 관절 데이터 동시 수집
* 다양한 물체 위치와 초기 자세에 대한 시연 데이터 수집
* 카메라 데이터를 사용하는 ACT 모방학습 및 성능 평가
* 카메라 영상을 입력으로 사용하는 OMX-F Follower 자율 제어
* 물체의 위치 변화에 대응하는 로봇 조작
* 저장된 궤적을 그대로 재생하는 방식이 아닌, 현재 환경을 관찰하여 action을 생성하는 제어

현재는 Teleoperation, Trajectory Recording, Trajectory Replay와 관절 데이터 대상 ACT 실험용 로컬 학습 스크립트를 제공합니다. 카메라 데이터가 추가되면 시각 기반 모방학습으로 확장할 수 있습니다.

## Safety

로봇팔을 실행하기 전에 다음 사항을 확인해야 합니다.

* Follower 주변에 사람이나 장애물이 없는지 확인
* OMX-F Follower의 12V 전원 연결 확인
* Leader와 Follower의 시리얼 포트 확인
* 재생 전 기록 당시와 비슷한 시작 자세로 배치
* 처음에는 짧고 느린 움직임으로 시험
* 비정상적인 움직임이 발생하면 `Ctrl+C`로 즉시 종료
