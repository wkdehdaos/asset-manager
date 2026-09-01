/** 화면 전환 중 즉시 표시되는 로딩 — 탭 이동이 멈춘 느낌 없이 바로 반응하게. */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
    </div>
  );
}
