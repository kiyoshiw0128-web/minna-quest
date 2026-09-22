import { JOBS } from '@mq/core';

type Props = { jobId: string; className?: string; decorative?: boolean };

export function JobArt({ jobId, className = '', decorative = false }: Props) {
  const job = JOBS[jobId as keyof typeof JOBS];
  if (job === undefined) return null;
  return (
    <img
      className={`job-art ${className}`.trim()}
      src={`/jobs/${job.id}.webp`}
      alt={decorative ? '' : `${job.name}の姿`}
      width="512"
      height="512"
      loading="lazy"
    />
  );
}
