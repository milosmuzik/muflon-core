export default function IndexCard({
  label,
  children,
  className = "",
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`index-card p-5 pl-8 ${className}`}>
      {label && <div className="tab-label mb-3">{label}</div>}
      {children}
    </div>
  );
}
