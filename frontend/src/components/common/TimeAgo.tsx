import { useEffect, useState } from 'react';

interface TimeAgoProps {
  timestamp: string | number | Date;
}

export const TimeAgo = ({ timestamp }: TimeAgoProps) => {
  const [timeAgo, setTimeAgo] = useState<string>('');

  useEffect(() => {
    const calculateTimeAgo = () => {
      const date = new Date(timestamp);
      const now = new Date();
      const differenceMs = now.getTime() - date.getTime();
      const seconds = Math.floor(differenceMs / 1000);

      if (seconds < 1) {
        setTimeAgo('0s');
        return;
      }

      if (seconds < 60) {
        setTimeAgo(`${seconds}s`);
        return;
      }

      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) {
        setTimeAgo(`${minutes}m ${seconds % 60}s`);
        return;
      }

      const hours = Math.floor(minutes / 60);
      setTimeAgo(`${hours}h ${minutes % 60}m`);
    };

    calculateTimeAgo();
    const interval = setInterval(calculateTimeAgo, 1000);

    return () => clearInterval(interval);
  }, [timestamp]);

  return <>{timeAgo}</>;
};

export default TimeAgo;
