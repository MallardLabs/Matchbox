import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import { useTheme } from "@/contexts/ThemeContext"
import {
  Button,
  HeadingSmall,
  ParagraphLarge,
  ParagraphSmall,
  useStyletron,
} from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useAccount } from "wagmi"

interface ActionCardProps {
  title: string
  description: string
  buttonText: string
  href: string
  variant?: "primary" | "secondary"
}

function ActionCard({
  title,
  description,
  buttonText,
  href,
  variant = "primary",
}: ActionCardProps) {
  const [css, theme] = useStyletron()

  return (
    <div
      className={css({
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        padding: "24px",
        borderRadius: "16px",
        border: `1px solid ${theme.colors.borderOpaque}`,
        backgroundColor: theme.colors.backgroundPrimary,
        height: "100%",
      })}
    >
      <HeadingSmall marginBottom="scale300">{title}</HeadingSmall>
      <ParagraphSmall
        color={theme.colors.contentSecondary}
        overrides={{
          Block: {
            style: {
              lineHeight: "1.5",
              marginBottom: "16px",
            },
          },
        }}
      >
        {description}
      </ParagraphSmall>
      <Link href={href} passHref legacyBehavior>
        <Button kind={variant} $as="a">
          {buttonText}
        </Button>
      </Link>
    </div>
  )
}

export default function HomePage() {
  const [css, theme] = useStyletron()
  const { isConnected } = useAccount()
  const { theme: currentTheme } = useTheme()

  return (
    <Layout>
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "48px",
          paddingTop: "48px",
          "@media (max-width: 768px)": {
            gap: "32px",
            paddingTop: "24px",
          },
        })}
      >
        <SpringIn delay={0} variant="card">
          <div
            className={css({
              textAlign: "center",
              maxWidth: "600px",
            })}
          >
            <div
              className={css({
                display: "flex",
                justifyContent: "center",
                marginBottom: "24px",
              })}
            >
              <img
                src="/matchbox.png"
                alt="Matchbox"
                className={css({
                  height: "80px",
                  width: "auto",
                  imageRendering: "crisp-edges",
                  filter: currentTheme === "dark" ? "invert(1)" : "none",
                })}
              />
            </div>
            <ParagraphLarge color={theme.colors.contentSecondary}>
              Boost your veBTC voting power with veMEZO or attract veMEZO
              capital to your gauge with incentives.
            </ParagraphLarge>
          </div>
        </SpringIn>

        <div
          className={css({
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "20px",
            width: "100%",
            maxWidth: "900px",
            "@media (max-width: 900px)": {
              gridTemplateColumns: "1fr",
              gap: "16px",
            },
          })}
        >
          <SpringIn delay={1} variant="card">
            <ActionCard
              title="veMEZO Holders"
              description="Vote on veBTC gauges to boost their voting power and earn incentives in return."
              buttonText="Vote to Boost"
              href="/boost"
            />
          </SpringIn>
          <SpringIn delay={2} variant="card">
            <ActionCard
              title="veBTC Holders"
              description="Add incentives to your gauge to attract veMEZO votes and boost your voting power."
              buttonText="Add Incentives"
              href="/incentives"
            />
          </SpringIn>
          <SpringIn delay={3} variant="card">
            <ActionCard
              title="Track Performance"
              description="Monitor your boosts, fees earned, and gauge performance over time."
              buttonText="View Dashboard"
              href="/dashboard"
              variant="secondary"
            />
          </SpringIn>
        </div>

        {!isConnected && (
          <SpringIn delay={4} variant="card">
            <div
              className={css({
                backgroundColor: theme.colors.backgroundSecondary,
                padding: "24px",
                borderRadius: "12px",
                textAlign: "center",
              })}
            >
              <ParagraphSmall color={theme.colors.contentSecondary}>
                Connect your wallet to get started
              </ParagraphSmall>
            </div>
          </SpringIn>
        )}
      </div>
    </Layout>
  )
}
