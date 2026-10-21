import { cn } from "@repo/ui/cn"
import * as Dialog from "@repo/ui/dialog"
import * as Input from "@repo/ui/input"
import * as Kbd from "@repo/ui/kbd"
import { useNavigate } from "@tanstack/react-router"
import { BookOpen, CornerDownLeft, Search } from "lucide-react"
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  type DocsEntry,
  type DocsTarget,
  buildDocsIndex,
  searchDocs,
} from "../../lib/docs-search"

type DocsSearchValue = { open: () => void }

const DocsSearchContext = createContext<DocsSearchValue>({ open: () => {} })

export function useDocsSearch(): DocsSearchValue {
  return useContext(DocsSearchContext)
}

/** ⌘K / Ctrl+K docs search over guides and API reference operations. */
export function DocsSearchProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const [open, setOpen] = useState(false)
  const value = useMemo(() => ({ open: () => setOpen(true) }), [])

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <DocsSearchContext.Provider value={value}>
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        {open ? <SearchDialog onClose={() => setOpen(false)} /> : null}
      </Dialog.Root>
    </DocsSearchContext.Provider>
  )
}

/** Guides only; endpoints join once the OpenAPI chunk has loaded. */
const guideIndex = buildDocsIndex([])

let fullIndex: Promise<DocsEntry[]> | null = null

/** Loads the API reference lazily so the shell bundle stays small. */
function loadDocsIndex(): Promise<DocsEntry[]> {
  fullIndex ??= Promise.all([
    import("@repo/platform-contracts/openapi.json"),
    import("../../lib/openapi"),
  ]).then(([spec, openapi]) =>
    buildDocsIndex(openapi.groupEndpoints(openapi.parseOpenApi(spec.default))),
  )
  return fullIndex
}

function useDocsIndex(): DocsEntry[] {
  const [index, setIndex] = useState<DocsEntry[]>(guideIndex)
  useEffect(() => {
    let active = true
    loadDocsIndex().then(
      (loaded) => {
        if (active) setIndex(loaded)
      },
      () => {},
    )
    return () => {
      active = false
    }
  }, [])
  return index
}

function SearchDialog({ onClose }: { onClose: () => void }): ReactElement {
  const [query, setQuery] = useState("")
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const statusId = useId()
  const index = useDocsIndex()
  const results = useMemo(() => searchDocs(index, query), [index, query])

  const go = useCallback(
    (target: DocsTarget) => {
      onClose()
      if (target.kind === "quickstart") void navigate({ to: "/docs" })
      else if (target.kind === "guide") {
        void navigate({ to: "/docs/$page", params: { page: target.page } })
      } else {
        void navigate({
          to: "/docs/reference",
          ...(target.anchor === undefined ? {} : { hash: target.anchor }),
        })
      }
    },
    [navigate, onClose],
  )

  function focusResult(index: number): void {
    const buttons =
      listRef.current?.querySelectorAll<HTMLButtonElement>("[data-result]")
    if (buttons === undefined || buttons.length === 0) return
    if (index < 0) {
      inputRef.current?.focus()
      return
    }
    buttons[Math.min(index, buttons.length - 1)]?.focus()
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      focusResult(0)
    }
    if (event.key === "Enter") {
      const first = results[0]
      if (first !== undefined) {
        event.preventDefault()
        go(first.target)
      }
    }
  }

  function onResultKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      focusResult(index + 1)
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      focusResult(index - 1)
    }
  }

  return (
    <Dialog.Content
      size="md"
      hideClose
      aria-describedby={undefined}
      overlayClassName="sm:items-start sm:pt-[12vh]"
      className="mb-auto mt-0 p-3"
    >
      <Dialog.Title className="sr-only">Search docs</Dialog.Title>
      <Input.Group size="lg">
        <Input.Adornment>
          <Search aria-hidden="true" size={16} strokeWidth={1.75} />
        </Input.Adornment>
        <Input.Root
          ref={inputRef}
          type="search"
          aria-label="Search docs"
          aria-describedby={statusId}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search docs"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKeyDown}
        />
        <Input.Adornment>
          <Kbd.Root>Esc</Kbd.Root>
        </Input.Adornment>
      </Input.Group>
      <p id={statusId} aria-live="polite" className="sr-only">
        {results.length === 0
          ? "No results"
          : `${results.length} results, arrow down to browse`}
      </p>
      {results.length === 0 ? (
        <p className="px-2 pb-2 text-body-sm text-secondary">No results</p>
      ) : (
        <ul
          ref={listRef}
          aria-label="Results"
          className="m-0 flex max-h-[min(60vh,420px)] list-none flex-col overflow-y-auto p-0"
        >
          {results.map((entry, index) => (
            <li key={entry.id}>
              <button
                type="button"
                data-result
                onClick={() => go(entry.target)}
                onKeyDown={(event) => onResultKeyDown(event, index)}
                className="group flex w-full min-w-0 items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none hover:bg-inset focus-visible:bg-inset"
              >
                <ResultIcon entry={entry} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      "truncate text-body-sm text-ink",
                      entry.method === null ? "font-600" : "font-mono",
                    )}
                  >
                    {entry.title}
                  </span>
                  <span className="truncate text-label text-secondary">
                    {entry.detail}
                  </span>
                </span>
                <CornerDownLeft
                  aria-hidden="true"
                  size={14}
                  strokeWidth={1.75}
                  className="shrink-0 text-muted opacity-0 group-focus-visible:opacity-100"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog.Content>
  )
}

function ResultIcon({ entry }: { entry: DocsEntry }): ReactElement {
  if (entry.method === null) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-inset-2 text-secondary">
        <BookOpen aria-hidden="true" size={15} strokeWidth={1.75} />
      </span>
    )
  }
  return (
    <span
      className={cn(
        "flex h-6 w-11 shrink-0 items-center justify-center rounded font-mono text-micro font-500",
        entry.method === "GET"
          ? "bg-inset-2 text-ink-2"
          : "bg-accent-soft text-accent-ink",
      )}
    >
      {entry.method}
    </span>
  )
}

/** Top bar trigger: a field on desktop, an icon button on phones. */
export function DocsSearchButton(): ReactElement {
  const { open } = useDocsSearch()
  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-keyshortcuts="Control+K Meta+K"
        className="hidden h-9 w-[280px] shrink items-center gap-2 rounded-lg border border-line bg-inset pl-3 pr-2 text-left text-body-sm text-muted transition-colors hover:border-line-2 lg:flex"
      >
        <Search aria-hidden="true" size={15} strokeWidth={1.75} />
        <span className="flex-1 truncate">Search docs</span>
        <Kbd.Root className="h-5 bg-inset-2">⌘K</Kbd.Root>
      </button>
      <button
        type="button"
        onClick={open}
        aria-label="Search docs"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-inset text-ink-2 transition-colors hover:text-ink lg:hidden"
      >
        <Search aria-hidden="true" size={16} strokeWidth={1.75} />
      </button>
    </>
  )
}
