export default function PlaceholderPage({ title }: { title?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
      {title ?? '준비 중'}
    </div>
  );
}
