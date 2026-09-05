export default function MobilePreviewPage() {
  return <main className="min-h-dvh bg-[#dce5ef] px-2 py-6 text-center sm:px-6">
    <h1 className="text-xl font-bold text-[#283c55]">Harbour · iPhone 17 Pro Max</h1>
    <p className="mx-auto mb-5 mt-2 max-w-md text-sm text-[var(--muted)]">Interactive 440 × 956 layout preview. Sign in if prompted. Changes here update your real account.</p>
    <div className="mx-auto w-full max-w-[464px] rounded-[40px] bg-[#172033] p-3 shadow-2xl">
      <iframe title="Harbour mobile app — iPhone 17 Pro Max layout" src="/" allow="microphone; autoplay" className="block h-[956px] w-full rounded-[28px] border-0 bg-[#f4f1ea]" />
    </div>
    <p className="mt-4 text-xs text-[var(--muted)]">Responsive browser preview; device hardware and Safari behavior may differ.</p>
  </main>;
}
