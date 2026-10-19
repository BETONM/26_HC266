import {useEffect, useRef} from 'react';
import type {VideoSource} from '../adapters/device/types';

/**
 * 영상 하나. MJPEG URL은 <img>, MediaStream은 <video>로 그린다.
 * srcObject를 나중에 붙이면 autoPlay만으로 재생이 시작되지 않을 때가 있어 play()를 직접 부른다.
 * 같은 MediaStream을 카드와 확대 보기가 함께 붙여도 된다(연결은 하나).
 */
export function VideoView({source, label, className}: {source: VideoSource; label: string; className?: string}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = source.kind === 'stream' ? source.stream : null;

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !stream) return;
    element.srcObject = stream;
    void element.play().catch(() => undefined);
    return () => {
      element.srcObject = null;
    };
  }, [stream]);

  if (source.kind === 'url') return <img className={className} src={source.url} alt={label} draggable={false} />;
  return <video ref={videoRef} className={className} aria-label={label} autoPlay playsInline muted />;
}
