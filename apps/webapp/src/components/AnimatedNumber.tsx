import { useEffect, useState } from "react"

function TickerDigit({ char, index }: { char: string; index: number }) {
    const isNumber = /^[0-9]$/.test(char)

    if (!isNumber) {
        return <span className="inline-block">{char}</span>
    }

    const digit = parseInt(char, 10)

    // Stagger the animation from left to right
    const delay = index * 40
    // Durations look better when they are slightly varied or just very smooth
    const duration = 700 + (index * 20)

    return (
        <span className="relative inline-block h-[1.1em] overflow-hidden leading-none [mask-image:linear-gradient(to_bottom,transparent,black_15%,black_85%,transparent)]">
            {/* Invisible placeholder to maintain width */}
            <span className="invisible pointer-events-none tabular-nums">0</span>
            <span
                className="absolute left-0 top-0 flex flex-col will-change-transform"
                style={{
                    transform: `translateY(-${digit * 10}%)`,
                    transition: `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
                }}
            >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                    <span key={i} className="flex h-[1.1em] items-center justify-center tabular-nums">
                        {i}
                    </span>
                ))}
            </span>
        </span>
    )
}

export function AnimatedNumber({
    value,
    prefix = "",
    suffix = "",
    minFractionDigits = 2,
    maxFractionDigits = 2,
    initialValue = 0,
}: {
    value: number
    prefix?: string
    suffix?: string
    minFractionDigits?: number
    maxFractionDigits?: number
    initialValue?: number
}) {
    const [displayString, setDisplayString] = useState(() => {
        return initialValue.toLocaleString("en-US", {
            minimumFractionDigits: minFractionDigits,
            maximumFractionDigits: maxFractionDigits,
        })
    })

    useEffect(() => {
        const formatOptions = {
            minimumFractionDigits: minFractionDigits,
            maximumFractionDigits: maxFractionDigits,
        }
        const targetString = value.toLocaleString("en-US", formatOptions)

        if (targetString.length !== displayString.length) {
            // Structure changed (e.g. 9.99 -> 10.00), zero-fill target structure
            const zeroedString = targetString.replace(/[0-9]/g, "0")
            setDisplayString(zeroedString)

            const timer = setTimeout(() => {
                setDisplayString(targetString)
            }, 50)
            return () => clearTimeout(timer)
        }

        setDisplayString(targetString)
    }, [value, minFractionDigits, maxFractionDigits])

    const chars = displayString.split("")

    return (
        <span className="inline-flex items-baseline">
            {prefix && <span className="mr-[0.1em]">{prefix}</span>}
            <span className="inline-flex items-baseline">
                {chars.map((char, index) => (
                    <TickerDigit
                        key={`${index}-${char === "." || char === "," ? char : "num"}`}
                        char={char}
                        index={index}
                    />
                ))}
            </span>
            {suffix && <span className="ml-[0.1em]">{suffix}</span>}
        </span>
    )
}
