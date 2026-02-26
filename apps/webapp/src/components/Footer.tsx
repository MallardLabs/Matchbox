export function Footer(): JSX.Element {
  return (
    <footer className="w-full bg-[var(--surface)]/60 backdrop-blur-2xl py-6 mt-auto">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8 flex items-center justify-start">
        <a
          href="https://trellium.org"
          target="_blank"
          rel="noopener noreferrer"
          className="group transition-all duration-300"
        >
          <img
            src="/trellium.svg"
            alt="Trellium"
            className="h-4 w-auto opacity-30 transition-opacity duration-300 group-hover:opacity-60"
          />
        </a>
      </div>
    </footer>
  )
}
