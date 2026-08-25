import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { FaGithub } from 'react-icons/fa';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { Button } from '@/components/ui/button';
import { authService } from '@/services/auth.service';

interface GithubLoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function GithubLoginModal({
  open,
  onOpenChange,
  onSuccess,
}: GithubLoginModalProps) {
  const [deviceCode, setDeviceCode] = useState('');
  const [userCode, setUserCode] = useState('');
  const [verificationUri, setVerificationUri] = useState('');

  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const initializedRef = useRef(false);
  const startingRef = useRef(false);
  const pollingIntervalRef = useRef(5);

  const onSuccessRef = useRef(onSuccess);
  const onOpenChangeRef = useRef(onOpenChange);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const reset = useCallback(() => {
    setDeviceCode('');
    setUserCode('');
    setVerificationUri('');

    setLoading(false);
    setPolling(false);
    setCopied(false);
    setError('');

    initializedRef.current = false;
    startingRef.current = false;
    pollingIntervalRef.current = 5;
  }, []);

  const startFlow = useCallback(async () => {
    if (startingRef.current) return;

    startingRef.current = true;

    try {
      setLoading(true);
      setError('');

      const response = await authService.startDeviceFlow();

      setDeviceCode(response.device_code);
      setUserCode(response.user_code);
      setVerificationUri(response.verification_uri);

      if (response.interval) {
        pollingIntervalRef.current = response.interval;
      }

      setPolling(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to start GitHub authentication.',
      );

      setPolling(false);
    } finally {
      setLoading(false);
      startingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }

    if (initializedRef.current) return;

    initializedRef.current = true;

    void startFlow();
  }, [open, reset, startFlow]);

  useEffect(() => {
    if (!polling || !deviceCode) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    let currentInterval =
      pollingIntervalRef.current * 1000 + 1000;

    const scheduleNextPoll = () => {
      if (cancelled) return;

      timeoutId = setTimeout(() => {
        void poll();
      }, currentInterval);
    };

    const poll = async () => {
      if (cancelled) return;

      try {
        const response =
          await authService.pollForToken(deviceCode);

        if (cancelled) return;

        if (response.access_token) {
          setPolling(false);

          onSuccessRef.current();
          onOpenChangeRef.current(false);

          return;
        }

        if (response.error === 'slow_down') {
          if (response.interval) {
            currentInterval =
              response.interval * 1000 + 1000;
          } else {
            currentInterval += 5000;
          }
        } else if (response.interval) {
          currentInterval =
            response.interval * 1000 + 1000;
        }

        scheduleNextPoll();
      } catch (err) {
        console.debug(
          'GitHub authorization polling...',
          err,
        );

        scheduleNextPoll();
      }
    };

    scheduleNextPoll();

    return () => {
      cancelled = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [polling, deviceCode]);

  const handleRetry = async () => {
    setDeviceCode('');
    setUserCode('');
    setVerificationUri('');
    setPolling(false);
    setError('');

    await startFlow();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(userCode);

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1600);
    } catch {
      setError('Unable to copy the device code.');
    }
  };

  const handleAuthorize = () => {
    if (!verificationUri) return;

    window.open(
      verificationUri,
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent
        className="
          overflow-hidden
          border-border
          bg-background
          p-0
          shadow-2xl

          sm:max-w-[440px]
          sm:rounded-lg
        "
      >
        <div className="px-6 pb-6 pt-7">
          {/* GitHub icon */}
          <div className="mb-5 flex justify-center">
            <FaGithub className="size-11 text-foreground" />
          </div>

          {/* Header */}
          <DialogHeader className="space-y-2 text-center">
            <DialogTitle
              className="
                text-xl
                font-normal
                tracking-[-0.02em]
                text-foreground
              "
            >
              Connect to GitHub
            </DialogTitle>

            <DialogDescription
              className="
                mx-auto
                max-w-[340px]
                text-[13px]
                leading-5
                text-muted-foreground
              "
            >
              Lazy Review needs access to GitHub to read
              repositories and work with pull requests.
            </DialogDescription>
          </DialogHeader>

          {/* Authentication panel */}
          <div
            className="
              mt-6
              overflow-hidden
              rounded-lg
              border
              border-border
              bg-muted/30
            "
          >
            {loading ? (
              <LoadingState />
            ) : userCode ? (
              <div className="p-5">
                <p className="text-center text-[13px] font-semibold text-foreground">
                  Enter this code on GitHub
                </p>

                <p
                  className="
                    mt-1
                    text-center
                    text-xs
                    leading-5
                    text-muted-foreground
                  "
                >
                  Copy the one-time code, then continue to
                  GitHub to authorize this device.
                </p>

                {/* Code */}
                <div
                  className="
                    mt-5
                    flex
                    items-center
                    gap-2
                    rounded-md
                    border
                    border-border
                    bg-background
                    p-2
                  "
                >
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="
                      min-w-0
                      flex-1
                      rounded-md
                      px-3
                      py-2
                      text-left
                      outline-none
                      transition-colors

                      hover:bg-muted/40

                      focus-visible:ring-2
                      focus-visible:ring-ring
                    "
                  >
                    <span
                      className="
                        block
                        text-center
                        font-mono
                        text-[23px]
                        font-semibold
                        tracking-[0.13em]
                        text-foreground
                      "
                    >
                      {userCode}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopy}
                    className="
                      flex
                      size-8
                      shrink-0
                      items-center
                      justify-center
                      rounded-md
                      border
                      border-border
                      bg-muted/40
                      text-muted-foreground
                      transition-colors

                      hover:bg-muted
                      hover:text-foreground
                    "
                    aria-label="Copy device code"
                  >
                    {copied ? (
                      <Check className="size-4 text-emerald-500" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </button>
                </div>

                {copied && (
                  <p
                    className="
                      mt-2
                      text-center
                      text-[11px]
                      text-emerald-500
                    "
                  >
                    Code copied
                  </p>
                )}

                {/* Error */}
                {error && (
                  <GithubError
                    message={error}
                    onRetry={handleRetry}
                  />
                )}

                {/* Main CTA */}
                <Button
                  type="button"
                  onClick={handleAuthorize}
                  className="
                    mt-5
                    h-9
                    w-full
                    gap-2
                    rounded-md
                    text-[13px]
                    font-medium
                  "
                >
                  Continue on GitHub

                  <ExternalLink className="size-3.5" />
                </Button>

                {/* Polling state */}
                {polling && (
                  <div
                    className="
                      mt-4
                      flex
                      items-center
                      justify-center
                      gap-2
                      text-xs
                      text-muted-foreground
                    "
                  >
                    <Loader2 className="size-3.5 animate-spin" />

                    Waiting for authorization
                  </div>
                )}
              </div>
            ) : error ? (
              <div className="p-5">
                <GithubError
                  message={error}
                  onRetry={handleRetry}
                />
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <p
            className="
              mt-5
              text-center
              text-[11px]
              leading-[18px]
              text-muted-foreground
            "
          >
            Your GitHub access token is stored locally on
            this device.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[230px] items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />

        <p className="mt-3 text-[13px] font-medium text-foreground">
          Connecting to GitHub
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          Creating a device authorization…
        </p>
      </div>
    </div>
  );
}

function GithubError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="
        mt-4
        flex
        items-start
        gap-2.5
        rounded-md
        border
        border-destructive/20
        bg-destructive/[0.05]
        px-3
        py-2.5
      "
    >
      <AlertCircle
        className="
          mt-0.5
          size-4
          shrink-0
          text-destructive
        "
      />

      <div className="min-w-0 flex-1">
        <p className="text-xs leading-5 text-foreground">
          {message}
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="
            mt-1
            inline-flex
            items-center
            gap-1
            text-xs
            font-medium
            text-muted-foreground
            transition-colors

            hover:text-foreground
          "
        >
          <RefreshCw className="size-3" />

          Try again
        </button>
      </div>
    </div>
  );
}