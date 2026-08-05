

export const SplashScreen = () => {
    return (
        <div className='dark w-screen h-screen flex flex-col items-center justify-center bg-background text-foreground overflow-hidden relative selection:bg-emerald-500/30'>

            <div className="relative flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-1000">
                <div className="relative mb-6">
                    <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse" />
                    <img className='relative size-20 drop-shadow-2xl' src="/resources/images/logo.png" alt="logo" />
                </div>

                <h1 className='font-mono text-2xl font-bold tracking-tight mb-2'>
                    Lazy-review<span className="text-emerald-500">@ai</span>
                </h1>

                <div className="flex items-center gap-2 text-muted-foreground mt-4">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <p className='font-mono text-xs uppercase tracking-widest'>Initializing system...</p>
                </div>
            </div>
        </div>
    )
}
