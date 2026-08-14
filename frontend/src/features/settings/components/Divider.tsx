export function Divider({ inset = false }: { inset?: boolean }) {
  return (
    <div
      className={`border-b border-[#c6c6c8]/70 dark:border-[#38383a] ${inset ? 'ml-14' : ''
        }`}
    />
  );
}
