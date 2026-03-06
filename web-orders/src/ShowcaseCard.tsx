import { formatShowcaseTitle, formatShowcaseDescription } from './utils/formatShowcase'

type OutputSize = 'phone' | 'tablet' | 'laptop' | 'desktop'

export interface ShowcaseItem {
  id: string
  videoUrl: string
  title: string
  description: string
  outputSize?: OutputSize
}

interface ShowcaseCardProps {
  item: ShowcaseItem
  videoSrc: string
  /** 'landing' uses landing-showcase-card* classes; 'page' uses showcase-card* */
  variant: 'landing' | 'page'
}

const PREFIX = {
  landing: 'landing-showcase-card',
  page: 'showcase-card',
} as const

export function ShowcaseCard({ item, videoSrc, variant }: ShowcaseCardProps) {
  const p = PREFIX[variant]
  const title = formatShowcaseTitle(item.title)
  const description = item.description ? formatShowcaseDescription(item.description) : ''

  return (
    <article className={p}>
      <div
        className={`${p}-video-wrap`}
        data-output-size={item.outputSize || 'phone'}
      >
        <video
          src={videoSrc}
          controls
          playsInline
          preload="metadata"
          aria-label={`Showcase video: ${title}`}
          className={`${p}-video`}
        />
      </div>
      <div className={`${p}-body`}>
        <h3 className={`${p}-title`}>{title}</h3>
        {description ? <p className={`${p}-desc`}>{description}</p> : null}
      </div>
    </article>
  )
}
