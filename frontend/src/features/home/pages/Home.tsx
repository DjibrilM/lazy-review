

export const Home = () => {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Welcome to Lazy Review</h1>
        <p className="text-lg text-muted-foreground max-w-xl">
          Your offline AI reviewer is ready to go. Begin setting up your workspace or connecting to your repository.
        </p>
      </div>
    </div>
  );
};
