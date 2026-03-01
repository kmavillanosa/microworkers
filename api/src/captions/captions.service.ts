import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { NicheEntity } from './niche.entity'

const OLLAMA_BASE = 'http://localhost:11434'

// Rotating creative angles injected into prompts to force variety
const SCRIPT_ANGLES = [
  { tone: 'excited and hype', hook: 'Start with a bold shocking statement that stops the scroll.' },
  { tone: 'calm and thoughtful', hook: 'Open with a reflective question that makes the viewer think.' },
  { tone: 'storytelling narrative', hook: 'Begin like you are telling a story: "It started when..."' },
  { tone: 'motivational and inspiring', hook: 'Lead with an empowering call to action.' },
  { tone: 'conversational and friendly', hook: 'Talk like you are texting a close friend about this.' },
  { tone: 'dramatic and cinematic', hook: 'Open with a dramatic one-liner that builds suspense.' },
  { tone: 'educational and informative', hook: 'Start with a surprising fact or statistic.' },
  { tone: 'humorous and witty', hook: 'Open with a clever observation or light joke about the topic.' },
]

// Negative/controversial script angles — raw, opinionated, provocative
const NEGATIVE_SCRIPT_ANGLES = [
  { tone: 'outraged and confrontational', hook: 'Open with a blunt accusation or hard truth that shocks.' },
  { tone: 'cynical and sarcastic', hook: 'Start with a biting sarcastic remark about the situation.' },
  { tone: 'disappointed and critical', hook: 'Begin with "Nobody is talking about this — but they should be."' },
  { tone: 'alarming and urgent', hook: 'Open with a warning: "This is getting out of hand and here is why."' },
  { tone: 'rant-style passionate', hook: 'Start mid-thought like you cannot hold it in anymore.' },
  { tone: 'cold and analytical', hook: 'Open with a brutal fact that dismantles a popular belief.' },
  { tone: 'dark humor', hook: 'Lead with a darkly funny observation that makes people uncomfortable.' },
  { tone: 'conspiracy-adjacent skeptical', hook: 'Start with "They don\'t want you to know this, but..."' },
]

const CAPTION_ANGLES = [
  'Write it as a bold declaration that demands attention.',
  'Write it as a question that sparks curiosity.',
  'Write it as a mini story with a twist ending.',
  'Write it as an inspiring call to action.',
  'Write it as a relatable reaction — like "We all felt this!"',
  'Write it as a surprising fact reveal.',
  'Write it with a sense of urgency — "You need to see this NOW."',
  'Write it with a warm, community feel — "This is for all of us."',
]

// Global negative sentiment filter — always applied regardless of niche
const NEGATIVE_KEYWORDS = [
  'death', 'dead', 'kill', 'murder', 'war', 'attack', 'crash', 'disaster',
  'tragedy', 'crisis', 'fail', 'collapse', 'scandal', 'arrest', 'crime',
  'violence', 'abuse', 'fraud', 'corruption', 'accident', 'injury', 'fire',
  'flood', 'earthquake', 'explosion', 'terror', 'threat', 'ban', 'lawsuit',
]

export type Lang = 'english' | 'tagalog' | 'taglish' | 'auto'

const LANGUAGE_GUIDES: Record<Lang, string> = {
  english: 'Write in natural English only.',
  tagalog: 'Write entirely in natural Filipino/Tagalog. Do not mix English words unless they are proper nouns.',
  taglish: 'Write in natural Taglish — a natural Filipino-English mix the way Filipinos actually speak and post online.',
  auto: '', // resolved at runtime
}

export interface NicheRow {
  id: string
  label: string
  keywords: string
  rssFeeds: string[]
  createdAt: string
}

interface NewsItem {
  title: string
  description: string
  link: string
  /** When the RSS item has an image (enclosure, media:content, media:thumbnail, or img in description) */
  imageUrl?: string
}

@Injectable()
export class CaptionsService {
  private readonly logger = new Logger(CaptionsService.name)

  constructor(
    @InjectRepository(NicheEntity)
    private readonly nicheRepo: Repository<NicheEntity>,
  ) {}

  // ---------------------------------------------------------------------------
  // Niche CRUD
  // ---------------------------------------------------------------------------

  async listNiches(): Promise<NicheRow[]> {
    const rows = await this.nicheRepo.find({ order: { created_at: 'ASC' } })
    return rows.map(this.mapNiche)
  }

  async getNiche(id: string): Promise<NicheRow> {
    const row = await this.nicheRepo.findOne({ where: { id } })
    if (!row) throw new NotFoundException(`Niche "${id}" not found`)
    return this.mapNiche(row)
  }

  async createNiche(label: string, keywords: string, rssFeeds: string[]): Promise<NicheRow> {
    const baseId = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'niche'
    const id = `${baseId}-${randomUUID().slice(0, 6)}`
    const now = new Date().toISOString()
    await this.nicheRepo.insert({
      id,
      label: label.trim(),
      keywords: keywords.trim(),
      rss_feeds: JSON.stringify(rssFeeds),
      created_at: now,
    })
    return this.getNiche(id)
  }

  async updateNiche(id: string, label?: string, keywords?: string, rssFeeds?: string[]): Promise<NicheRow> {
    const existing = await this.getNiche(id)
    const newLabel = label?.trim() ?? existing.label
    const newKeywords = keywords?.trim() ?? existing.keywords
    const newFeeds = rssFeeds ?? existing.rssFeeds
    await this.nicheRepo.update(id, {
      label: newLabel,
      keywords: newKeywords,
      rss_feeds: JSON.stringify(newFeeds),
    })
    return this.getNiche(id)
  }

  async deleteNiche(id: string): Promise<void> {
    const result = await this.nicheRepo.delete(id)
    if (result.affected === 0) throw new NotFoundException(`Niche "${id}" not found`)
  }

  private mapNiche(row: NicheEntity): NicheRow {
    return {
      id: row.id,
      label: row.label,
      keywords: row.keywords,
      rssFeeds: JSON.parse(row.rss_feeds) as string[],
      createdAt: row.created_at,
    }
  }

  async suggestCaption(nicheId: string, model = 'llama3', lang: Lang = 'auto'): Promise<{
    caption: string
    headline: string
    source: string
    ollamaAvailable: boolean
  }> {
    const nicheRow = await this.resolveNiche(nicheId)
    const headlines = await this.fetchHeadlines(nicheRow.rssFeeds)
    const positive = this.filterPositive(headlines, nicheRow.keywords.split(',').map((k) => k.trim()))
    const pool = positive.length > 0 ? positive : headlines
    const picked = this.pickRandom(pool) ?? this.buildFallbackNewsItem(nicheRow.label)

    const angle = this.pickRandom(CAPTION_ANGLES) ?? CAPTION_ANGLES[0]
    const ollamaAvailable = await this.isOllamaAvailable()
    const caption = ollamaAvailable
      ? await this.generateCaptionWithOllama(picked.title, nicheRow.label, model, angle, lang)
      : this.generateFallbackCaption(picked.title, nicheRow.label)

    return { caption, headline: picked.title, source: picked.link, ollamaAvailable }
  }

  /**
   * Generate a caption for the specific article/headline (same story as the reel or image post).
   * Use this when you already have the headline from suggestScript so the caption matches the content.
   */
  async suggestCaptionForArticle(
    nicheId: string,
    headline: string,
    model = 'llama3',
    lang: Lang = 'auto',
  ): Promise<{ caption: string; headline: string; source: string; ollamaAvailable: boolean }> {
    const nicheRow = await this.resolveNiche(nicheId)
    const angle = this.pickRandom(CAPTION_ANGLES) ?? CAPTION_ANGLES[0]
    const ollamaAvailable = await this.isOllamaAvailable()
    const caption = ollamaAvailable
      ? await this.generateCaptionWithOllama(headline, nicheRow.label, model, angle, lang)
      : this.generateFallbackCaption(headline, nicheRow.label)
    return { caption, headline, source: '', ollamaAvailable }
  }

  async suggestScript(nicheId: string, model = 'llama3', lang: Lang = 'auto'): Promise<{
    script: string
    title: string
    headline: string
    source: string
    ollamaAvailable: boolean
    /** When the picked RSS item has an image — post this image instead of a reel and use articleCaption as the post text */
    imageUrl?: string
    /** Prepared caption from the article (title + description + link) for image posts */
    articleCaption?: string
  }> {
    const nicheRow = await this.resolveNiche(nicheId)
    const headlines = await this.fetchHeadlines(nicheRow.rssFeeds)
    const positive = this.filterPositive(headlines, nicheRow.keywords.split(',').map((k) => k.trim()))
    const pool = positive.length > 0 ? positive : headlines
    const picked = this.pickRandom(pool) ?? this.buildFallbackNewsItem(nicheRow.label)

    const angle = this.pickRandom(SCRIPT_ANGLES) ?? SCRIPT_ANGLES[0]
    const ollamaAvailable = await this.isOllamaAvailable()
    let script: string
    let title: string
    if (ollamaAvailable) {
      const result = await this.generateScriptWithOllama(picked.title, picked.description, nicheRow.label, model, angle, lang)
      script = result.script
      title = result.title
    } else {
      script = this.generateFallbackScript(picked.title, picked.description, nicheRow.label, angle.tone)
      title = picked.title.length > 60 ? picked.title.slice(0, 57) + '...' : picked.title
    }

    const out = {
      script,
      title,
      headline: picked.title,
      source: picked.link,
      ollamaAvailable,
      ...(picked.imageUrl && {
        imageUrl: picked.imageUrl,
        articleCaption: this.buildArticleCaption(picked),
      }),
    }
    return out
  }

  /**
   * Build post caption from article content: title, description snippet, and link.
   * Used when posting the RSS item's image instead of a reel.
   */
  private buildArticleCaption(item: NewsItem): string {
    const descSnippet = item.description
      ? item.description.slice(0, 300).replace(/\s+/g, ' ').trim() + (item.description.length > 300 ? '...' : '')
      : ''
    const lines = [item.title]
    if (descSnippet) lines.push('')
    if (descSnippet) lines.push(descSnippet)
    if (item.link) {
      lines.push('')
      lines.push(item.link)
    }
    return lines.join('\n')
  }

  private buildFallbackNewsItem(nicheLabel: string): NewsItem {
    const label = nicheLabel?.trim() || 'General'
    return {
      title: `Latest update on ${label}`,
      description: '',
      link: '',
    }
  }

  /**
   * Like suggestScript but intentionally negative/controversial — no positive filter,
   * picks from provocative angles, and instructs the LLM to be raw and critical.
   */
  async suggestNegativeCaption(nicheId: string, model = 'llama3', lang: Lang = 'auto'): Promise<{
    caption: string
    headline: string
    source: string
    ollamaAvailable: boolean
  }> {
    const nicheRow = await this.resolveNiche(nicheId)
    // Skip positive filter — use all headlines including controversial ones
    const headlines = await this.fetchHeadlines(nicheRow.rssFeeds)
    const picked = this.pickRandom(headlines) ?? this.buildFallbackNewsItem(nicheRow.label)

    const ollamaAvailable = await this.isOllamaAvailable()
    const caption = ollamaAvailable
      ? await this.generateNegativeCaptionWithOllama(picked.title, nicheRow.label, model, lang)
      : this.generateFallbackNegativeCaption(picked.title, nicheRow.label)

    return { caption, headline: picked.title, source: picked.link, ollamaAvailable }
  }

  async suggestNegativeScript(nicheId: string, model = 'llama3', lang: Lang = 'auto'): Promise<{
    script: string
    title: string
    headline: string
    source: string
    ollamaAvailable: boolean
  }> {
    const nicheRow = await this.resolveNiche(nicheId)
    // Deliberately skip the positive filter — pick from ALL headlines including negative ones
    const headlines = await this.fetchHeadlines(nicheRow.rssFeeds)
    const picked = this.pickRandom(headlines) ?? this.buildFallbackNewsItem(nicheRow.label)

    const angle = this.pickRandom(NEGATIVE_SCRIPT_ANGLES) ?? NEGATIVE_SCRIPT_ANGLES[0]
    const ollamaAvailable = await this.isOllamaAvailable()
    let script: string
    let title: string
    if (ollamaAvailable) {
      const result = await this.generateNegativeScriptWithOllama(picked.title, picked.description, nicheRow.label, model, angle, lang)
      script = result.script
      title = result.title
    } else {
      script = this.generateFallbackNegativeScript(picked.title, picked.description, nicheRow.label)
      title = picked.title.length > 60 ? picked.title.slice(0, 57) + '...' : picked.title
    }

    return { script, title, headline: picked.title, source: picked.link, ollamaAvailable }
  }

  /** Shuffle-based random pick — avoids repeating the same index on identical arrays */
  private pickRandom<T>(arr: T[]): T | undefined {
    if (arr.length === 0) return undefined
    // Fisher-Yates shuffle on a copy, then pick first
    const copy = [...arr]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy[0]
  }

  private async resolveNiche(nicheId: string): Promise<NicheRow> {
    try {
      return await this.getNiche(nicheId)
    } catch {
      const trimmed = nicheId?.trim()
      if (trimmed) {
        const id = trimmed
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'niche'
        return {
          id: `adhoc-${id}`,
          label: trimmed,
          keywords: '',
          rssFeeds: [],
          createdAt: new Date().toISOString(),
        }
      }
      const all = await this.listNiches()
      if (all.length > 0) return all[0]
      return {
        id: 'adhoc-general',
        label: 'General',
        keywords: '',
        rssFeeds: [],
        createdAt: new Date().toISOString(),
      }
    }
  }

  async listOllamaModels(): Promise<{ models: string[]; available: boolean }> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`)
      if (!res.ok) return { models: [], available: false }
      const data = (await res.json()) as { models: Array<{ name: string }> }
      return {
        models: data.models.map((m) => m.name),
        available: true,
      }
    } catch {
      return { models: [], available: false }
    }
  }

  /** Max items to parse per feed (includes older items; feeds list newest first). */
  private static readonly RSS_ITEMS_PER_FEED = 100
  /** Max items total across all feeds when building the pool for script/caption. */
  private static readonly RSS_ITEMS_TOTAL_CAP = 200

  private async fetchHeadlines(feedUrls: string[]): Promise<NewsItem[]> {
    const results: NewsItem[] = []

    for (const url of feedUrls) {
      if (results.length >= CaptionsService.RSS_ITEMS_TOTAL_CAP) break
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReelsBot/1.0)' },
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) continue
        const xml = await res.text()
        const items = this.parseRssItems(xml)
        const space = CaptionsService.RSS_ITEMS_TOTAL_CAP - results.length
        results.push(...items.slice(0, space))
      } catch (err) {
        this.logger.warn(`Failed to fetch RSS feed ${url}: ${String(err)}`)
      }
    }

    return results
  }

  private parseRssItems(xml: string): NewsItem[] {
    const items: NewsItem[] = []
    const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)

    for (const match of itemMatches) {
      const block = match[1]
      const title = this.extractTag(block, 'title')
      const description = this.extractTag(block, 'description')
      const link = this.extractTag(block, 'link')
      const imageUrl = this.extractImageFromItem(block, description)
      if (title) {
        items.push({
          title: this.cleanText(title),
          description: this.cleanText(description),
          link,
          ...(imageUrl && { imageUrl }),
        })
      }
      if (items.length >= CaptionsService.RSS_ITEMS_PER_FEED) break
    }

    return items
  }

  /**
   * Extract first image URL from RSS item: enclosure, media:content, media:thumbnail, or img in description.
   */
  private extractImageFromItem(itemBlock: string, description: string): string | undefined {
    // <enclosure url="..." type="image/..." />
    const enclosureMatch = itemBlock.match(
      /<enclosure\s[^>]*url\s*=\s*["']([^"']+)["'][^>]*type\s*=\s*["']image\/[^"']+["']/i,
    ) ?? itemBlock.match(
      /<enclosure\s[^>]*type\s*=\s*["']image\/[^"']+["'][^>]*url\s*=\s*["']([^"']+)["']/i,
    )
    if (enclosureMatch?.[1]) return enclosureMatch[1].trim()

    // <media:content url="..." medium="image" /> or medium="image"
    const mediaContentMatch = itemBlock.match(
      /<media:content\s[^>]*url\s*=\s*["']([^"']+)["'][^>]*(?:medium\s*=\s*["']image["']|type\s*=\s*["']image\/[^"']+["'])/i,
    ) ?? itemBlock.match(
      /<media:content\s[^>]*(?:medium\s*=\s*["']image["']|type\s*=\s*["']image\/[^"']+["'])[^>]*url\s*=\s*["']([^"']+)["']/i,
    )
    if (mediaContentMatch?.[1]) return mediaContentMatch[1].trim()

    // <media:thumbnail url="..." />
    const thumbMatch = itemBlock.match(/<media:thumbnail\s[^>]*url\s*=\s*["']([^"']+)["']/i)
    if (thumbMatch?.[1]) return thumbMatch[1].trim()

    // First <img src="..."> in description
    if (description) {
      const imgMatch = description.match(/<img\s[^>]*src\s*=\s*["']([^"']+)["']/i)
      if (imgMatch?.[1]) return imgMatch[1].trim()
    }

    return undefined
  }

  private extractTag(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))
    return match?.[1]?.trim() ?? ''
  }

  private cleanText(text: string): string {
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim()
  }

  private filterPositive(items: NewsItem[], positiveKeywords: string[]): NewsItem[] {
    return items.filter((item) => {
      const text = `${item.title} ${item.description}`.toLowerCase()
      const hasNegative = NEGATIVE_KEYWORDS.some((kw) => text.includes(kw))
      if (hasNegative) return false
      if (positiveKeywords.length === 0) return true
      return positiveKeywords.some((kw) => kw && text.includes(kw.toLowerCase()))
    })
  }

  private async isOllamaAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
        signal: AbortSignal.timeout(10000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  private async generateCaptionWithOllama(
    headline: string,
    niche: string,
    model: string,
    angle: string,
    lang: Lang = 'auto',
  ): Promise<string> {
    const languageGuide = this.resolveLanguageGuide(lang, `${niche} ${headline}`)

    const prompt = `Write a social media caption for a ${niche} short video reel.

Trending news headline: "${headline}"

Style direction: ${angle}

Rules:
- Language: ${languageGuide}
- 2 to 3 punchy sentences maximum
- Positive and uplifting tone only — no negativity
- Do NOT use first person ("I", "we", "my", "our") — write as a direct statement to the viewer
- Do NOT address the viewer as "you" in an AI-assistant way — write like a human posting on social media
- End with 8 to 12 relevant hashtags on a new line as plain words (no # symbol), e.g. "gaming viral shorts fyp"
- Mix: 2-3 niche-specific tags, 2-3 topic-specific tags, 3-4 reach tags (viral shorts fyp trending reels)
- Do NOT write "hashtags:" or "tags:" before them
- Output ONLY the caption text and hashtag words. No preamble, no explanation, no labels.`

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: { temperature: 0.95, num_predict: 200 },
        }),
        signal: AbortSignal.timeout(120000),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Ollama error: ${err}`)
      }

      const data = (await res.json()) as { response: string }
      return this.normalizeCaptionHashtags(data.response.trim())
    } catch (err) {
      this.logger.warn(`Ollama generation failed: ${String(err)}`)
      return this.generateFallbackCaption(headline, niche)
    }
  }

  /**
   * Normalize the hashtag line in a caption:
   * - Split camelCase/PascalCase compound words into individual words
   * - Lowercase everything
   * - Remove any # symbols
   * - Ensure hashtags are on their own line, space-separated
   */
  private normalizeCaptionHashtags(raw: string): string {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return raw

    // Detect which lines look like hashtag lines (no sentence punctuation, mostly word tokens)
    const captionLines: string[] = []
    const hashtagLines: string[] = []

    for (const line of lines) {
      const cleaned = line.replace(/#/g, '').trim()
      // A hashtag line: short tokens, no commas, no periods mid-sentence
      const tokens = cleaned.split(/\s+/)
      const looksLikeTags = tokens.length >= 3 && tokens.every((t) => /^[a-zA-Z0-9_]+$/.test(t))
      if (looksLikeTags && captionLines.length > 0) {
        hashtagLines.push(cleaned)
      } else {
        captionLines.push(line)
      }
    }

    if (hashtagLines.length === 0) return raw

    // Split camelCase/PascalCase tokens into individual lowercase words
    const allTags = hashtagLines
      .join(' ')
      .split(/\s+/)
      .flatMap((token) =>
        token
          // Split on camelCase boundaries: "DutertePolitics" → ["Duterte", "Politics"]
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
          .split(/\s+/)
          .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
          .filter(Boolean),
      )
      // Deduplicate
      .filter((tag, idx, arr) => arr.indexOf(tag) === idx)

    return captionLines.join('\n') + '\n\n' + allTags.join(' ')
  }

  private generateFallbackCaption(headline: string, niche: string): string {
    const nicheHashtags: Record<string, string> = {
      gaming: 'gaming gamer gaminglife videogames gameplay gamingcommunity pcgaming consolegaming shorts viral fyp trending reels',
      tech: 'tech technology innovation techlife gadgets futuretech aitech startup shorts viral fyp trending reels',
      sports: 'sports athlete sportslife winning champion fitness motivation sportsnews shorts viral fyp trending reels',
      entertainment: 'entertainment celebrity popculture showbiz entertainment news viral trending fyp shorts reels mustwatch',
      news: 'news breakingnews latestnews currentevents worldnews todaynews viral trending fyp shorts reels',
      philippines: 'philippines pilipinas pinoy filipinonews phtrending pinoylife balita fyp shorts viral trending reels',
      'bible-quotes-faith': 'bible bibleverseoftheday faith Jesus God prayer blessing gospel scripture Christian devotion worship amen shorts viral fyp reels',
    }

    const nicheKey = niche.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const tags = nicheHashtags[nicheKey] ?? nicheHashtags[niche.toLowerCase()] ?? nicheHashtags['news']
    const isBible = nicheKey.includes('bible') || nicheKey.includes('faith')
    if (isBible) {
      return `✝️ "${headline}" — Let this word speak to your heart today. Share this blessing with someone who needs it.\n\n${tags}`
    }
    return `🔥 ${headline} — This is something you need to see! Stay informed and stay positive.\n\n${tags}`
  }

  private async generateScriptWithOllama(
    headline: string,
    description: string,
    niche: string,
    model: string,
    angle: { tone: string; hook: string },
    lang: Lang = 'auto',
  ): Promise<{ script: string; title: string }> {
    const languageGuide = this.resolveLanguageGuide(lang, `${niche} ${headline} ${description}`)

    const context = description ? `Headline: "${headline}"\nContext: "${description}"` : `Headline: "${headline}"`

    const prompt = `Write a spoken narration script for a 60-90 second ${niche} short video reel.

${context}

Tone: ${angle.tone}
Opening hook: ${angle.hook}

Rules:
- Language: ${languageGuide}
- Positive and uplifting only — no negative remarks
- Target length: 150 to 180 words — enough to fill at least 60 seconds when spoken aloud
- 8 to 12 sentences — develop the story, add context, build to a conclusion
- No hashtags, no emojis, no stage directions, no "Scene:" labels
- Do NOT use first person ("I", "we", "my") — write as a narrator speaking directly to the audience
- Do NOT add any preamble like "Here is the script:" or "Sure, here's..." — output the spoken words immediately
- The first sentence MUST follow the opening hook above
- Write ONLY the spoken words a narrator would say out loud

Then on a NEW LINE write: TITLE: followed by a short punchy video title (max 8 words, no hashtags).

Output ONLY the script lines and the TITLE line. Nothing else.`

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: { temperature: 0.95, num_predict: 600 },
        }),
        signal: AbortSignal.timeout(180000),
      })

      if (!res.ok) throw new Error(`Ollama error: ${await res.text()}`)

      const data = (await res.json()) as { response: string }
      const raw = data.response.trim()

      const titleMatch = raw.match(/^TITLE:\s*(.+)$/im)
      const title = titleMatch?.[1]?.trim() ?? headline.slice(0, 60)
      const script = this.cleanScriptOutput(raw.replace(/^TITLE:.*$/im, '').trim())

      return { script, title }
    } catch (err) {
      this.logger.warn(`Ollama script generation failed: ${String(err)}`)
      return {
        script: this.generateFallbackScript(headline, description, niche),
        title: headline.length > 60 ? headline.slice(0, 57) + '...' : headline,
      }
    }
  }

  /**
   * Strip any label prefixes that LLMs sometimes add before the actual script,
   * e.g. "Script:", "Narration:", "Script (English):", "Here is the script:", etc.
   */
  private cleanScriptOutput(raw: string): string {
    return raw
      // Remove leading AI preamble lines: "Sure!", "Of course!", "Here is...", "Here's...", etc.
      .replace(/^(sure[!,.]?|of course[!,.]?|absolutely[!,.]?|certainly[!,.]?|great[!,.]?)\s*/im, '')
      // Remove "Here is/Here's the/your script/narration/caption..." lines
      .replace(/^here'?s?\s+(is\s+)?(the|your|a)?\s*(script|narration|narrator|voiceover|caption|spoken words?)[^:\n]*[:\-–—]?\s*/im, '')
      // Remove standalone label lines like "Script:", "Narration:", "Voiceover:" at the start
      .replace(/^(script|narration|narrator|voiceover|spoken words?)\s*[:()\-–—]+\s*/im, '')
      // Remove any remaining short label on its own line at the very start
      .replace(/^\s*[A-Za-z ]{1,30}:\s*\n/m, '')
      .trim()
  }

  private generateFallbackScript(headline: string, description: string, niche: string, tone?: string): string {
    const nicheIntros: Record<string, string[]> = {
      'bible-quotes-faith': [
        'Let this scripture fill your heart today.',
        'God\'s word has a message for you right now.',
        'This verse is exactly what you needed to hear.',
        'Take a moment and let this truth sink in.',
      ],
      gaming: [
        'Gamers, you are not going to believe this.',
        'This just changed the game — literally.',
        'If you love gaming, stop everything and listen.',
        'The gaming world is buzzing right now.',
      ],
      tech: [
        'The tech world just made a huge move.',
        'This is the innovation nobody saw coming.',
        'Here is why every tech fan is talking about this.',
        'The future just arrived — and it looks like this.',
      ],
      sports: [
        'Sports fans, this one is for you.',
        'This moment will go down in history.',
        'Athletes everywhere are inspired by this story.',
        'You will not believe what just happened in sports.',
      ],
      entertainment: [
        'This is the story everyone is talking about.',
        'Hollywood just dropped something incredible.',
        'Pop culture will never be the same after this.',
        'Everyone in entertainment is reacting to this.',
      ],
      news: [
        'Here is something you need to know right now.',
        'This story is changing everything.',
        'Stop what you are doing — this matters.',
        'The world is watching this unfold.',
      ],
      philippines: [
        'Mga kababayan, narito ang pinakabagong balita.',
        'Pilipinas, pakinggan ninyo ito.',
        'Ito ang kwentong kailangan nating marinig.',
        'Ang balitang ito ay para sa lahat ng Pilipino.',
      ],
    }

    const nicheKey = niche.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const intros = nicheIntros[nicheKey] ?? nicheIntros[niche.toLowerCase()] ?? nicheIntros['news']
    const intro = this.pickRandom(intros) ?? intros[0]
    const body = description
      ? `${headline}. ${description.slice(0, 200)}`
      : `${headline}.`

    const isBible = nicheKey.includes('bible') || nicheKey.includes('faith')
    const outros = isBible ? [
      'Share this with someone who needs God\'s word today. God bless you!',
      'Type Amen if this blessed you. Follow for daily scripture.',
      'Let this verse guide your day. Share the blessing!',
      'May this word bring you peace and strength. God is with you.',
    ] : [
      'Stay positive, stay informed, and keep pushing forward. Drop a like if this made your day!',
      'Share this with someone who needs to hear it. Together we rise!',
      'This is the kind of story that reminds us why we keep going. Like and follow for more!',
      'What do you think about this? Let me know in the comments below!',
    ]
    const outro = this.pickRandom(outros) ?? outros[0]

    return `${intro} ${body} ${outro}`
  }

  private async generateNegativeCaptionWithOllama(
    headline: string,
    niche: string,
    model: string,
    lang: Lang = 'auto',
  ): Promise<string> {
    const languageGuide = this.resolveLanguageGuide(lang, `${niche} ${headline}`)

    const negativeAngles = [
      'Write it as an outraged reaction that calls people out.',
      'Write it as a cynical, sarcastic take that exposes the absurdity.',
      'Write it as a frustrated rant that demands accountability.',
      'Write it as a blunt wake-up call: "Nobody is talking about this."',
      'Write it as a dark, provocative statement that makes people uncomfortable.',
      'Write it as a conspiracy-adjacent skeptical take: "They don\'t want you to know..."',
    ]
    const angle = this.pickRandom(negativeAngles) ?? negativeAngles[0]

    const prompt = `Write a raw, opinionated social media caption for a ${niche} short video reel.

Trending news headline: "${headline}"

Style direction: ${angle}

Rules:
- Language: ${languageGuide}
- 2 to 3 punchy sentences maximum
- Be critical, provocative, or confrontational — this is NOT a feel-good caption
- Express frustration, skepticism, or outrage where appropriate
- Do NOT use first person ("I", "we", "my", "our") — write as a direct statement or observation
- Do NOT address the viewer in an AI-assistant way — write like a human venting on social media
- End with 8 to 12 relevant hashtags on a new line as plain words (no # symbol)
- Mix: 2-3 niche-specific tags, 2-3 topic-specific tags, 3-4 reach tags (viral shorts fyp trending reels)
- Do NOT write "hashtags:" or "tags:" before them
- Output ONLY the caption text and hashtag words. No preamble, no explanation, no labels.`

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: { temperature: 0.98, num_predict: 200 },
        }),
        signal: AbortSignal.timeout(120000),
      })

      if (!res.ok) throw new Error(`Ollama error: ${await res.text()}`)

      const data = (await res.json()) as { response: string }
      return this.normalizeCaptionHashtags(data.response.trim())
    } catch (err) {
      this.logger.warn(`Ollama negative caption generation failed: ${String(err)}`)
      return this.generateFallbackNegativeCaption(headline, niche)
    }
  }

  private generateFallbackNegativeCaption(headline: string, niche: string): string {
    const intros = [
      `This is NOT okay and everyone needs to stop ignoring it.`,
      `Nobody wants to say it, but this is exactly what's wrong with ${niche}.`,
      `They keep letting this happen and nobody is held accountable.`,
      `Wake up. This is the reality they don't want you to see.`,
    ]
    const intro = this.pickRandom(intros) ?? intros[0]
    const tags = `${niche.toLowerCase().replace(/\s+/g, '')} viral trending fyp shorts reels exposing truth wakeup accountability`
    return `${intro} ${headline}.\n\n${tags}`
  }

  private async generateNegativeScriptWithOllama(
    headline: string,
    description: string,
    niche: string,
    model: string,
    angle: { tone: string; hook: string },
    lang: Lang = 'auto',
  ): Promise<{ script: string; title: string }> {
    const languageGuide = this.resolveLanguageGuide(lang, `${niche} ${headline} ${description}`)

    const context = description ? `Headline: "${headline}"\nContext: "${description}"` : `Headline: "${headline}"`

    const prompt = `Write a hard-hitting spoken narration script for a 60-90 second ${niche} short video reel.

${context}

Tone: ${angle.tone}
Opening hook: ${angle.hook}

Rules:
- Language: ${languageGuide}
- Be raw, critical, and opinionated — this is NOT a feel-good script
- Express frustration, skepticism, or outrage where appropriate
- Target length: 150 to 180 words — enough to fill at least 60 seconds when spoken aloud
- 8 to 12 sentences — build the argument, add evidence, drive the point home
- No hashtags, no emojis, no stage directions, no "Scene:" labels
- Do NOT use first person ("I", "we", "my") — write as a narrator speaking directly to the audience
- Do NOT add any preamble like "Here is the script:" or "Sure, here's..." — output the spoken words immediately
- The first sentence MUST follow the opening hook above
- Write ONLY the spoken words a narrator would say out loud

Then on a NEW LINE write: TITLE: followed by a short punchy provocative video title (max 8 words, no hashtags).

Output ONLY the script lines and the TITLE line. Nothing else.`

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: { temperature: 0.98, num_predict: 600 },
        }),
        signal: AbortSignal.timeout(180000),
      })

      if (!res.ok) throw new Error(`Ollama error: ${await res.text()}`)

      const data = (await res.json()) as { response: string }
      const raw = data.response.trim()

      const titleMatch = raw.match(/^TITLE:\s*(.+)$/im)
      const title = titleMatch?.[1]?.trim() ?? headline.slice(0, 60)
      const script = this.cleanScriptOutput(raw.replace(/^TITLE:.*$/im, '').trim())

      return { script, title }
    } catch (err) {
      this.logger.warn(`Ollama negative script generation failed: ${String(err)}`)
      return {
        script: this.generateFallbackNegativeScript(headline, description, niche),
        title: headline.length > 60 ? headline.slice(0, 57) + '...' : headline,
      }
    }
  }

  private generateFallbackNegativeScript(headline: string, description: string, niche: string): string {
    const intros = [
      `Nobody wants to say it out loud, but here is the truth about ${niche}.`,
      `This is exactly what is wrong with the situation right now.`,
      `Let us be honest — this is not okay, and people need to wake up.`,
      `They keep ignoring this, but the evidence is right in front of us.`,
      `Stop pretending everything is fine. Here is what is really going on.`,
    ]
    const intro = this.pickRandom(intros) ?? intros[0]
    const body = description
      ? `${headline}. ${description.slice(0, 200)}`
      : `${headline}.`
    const outros = [
      'Share this if you are tired of being lied to. The truth matters.',
      'Comment your thoughts below — because silence is not an option anymore.',
      'Like if you agree that this needs to change. We deserve better.',
      'Follow for more unfiltered takes. Someone has to say it.',
    ]
    const outro = this.pickRandom(outros) ?? outros[0]
    return `${intro} ${body} ${outro}`
  }

  /**
   * Normalize a caption before posting to social media.
   *
   * The AI returns hashtags as plain words on the last line, e.g.:
   *   "Great news today!\n\ngaming viral shorts fyp trending"
   *
   * This converts every plain word on the last line to a #hashtag so Facebook
   * and Instagram actually index them.  Words that already start with # are
   * left untouched.
   */
  static prepareCaptionForPost(caption: string): string {
    if (!caption?.trim()) return caption ?? ''

    const lines = caption.split('\n')
    // Walk backwards to find the last non-empty line
    let lastIdx = lines.length - 1
    while (lastIdx >= 0 && !lines[lastIdx].trim()) lastIdx--
    if (lastIdx < 0) return caption

    const lastLine = lines[lastIdx].trim()

    // Heuristic: the line is a hashtag block if it contains only word-chars,
    // spaces, and existing # symbols — and has at least 2 space-separated tokens.
    const tokens = lastLine.split(/\s+/).filter(Boolean)
    const looksLikeTagLine =
      tokens.length >= 2 &&
      tokens.every((t) => /^#?[a-zA-Z0-9_À-ÿ]+$/.test(t))

    if (!looksLikeTagLine) return caption

    const tagLine = tokens.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')
    const result = [...lines.slice(0, lastIdx), tagLine].join('\n')
    return result
  }

  private resolveLanguageGuide(lang: Lang, contextText: string): string {
    if (lang !== 'auto') return LANGUAGE_GUIDES[lang]
    // Auto-detect: use Taglish for Filipino niches, English otherwise
    return this.isFilipinoContext(contextText)
      ? LANGUAGE_GUIDES['taglish']
      : LANGUAGE_GUIDES['english']
  }

  private isFilipinoContext(text: string): boolean {
    const t = text.toLowerCase()
    // Never use Tagalog for Bible/faith content — keep it reverent English
    if (t.includes('bible') || t.includes('scripture') || t.includes('gospel') || t.includes('devotion')) {
      return false
    }
    const signals = [
      'pinoy', 'pilipinas', 'kababayan', 'balita', 'bagyo', 'baha',
      'sahod', 'jowa', 'hiwalayan', 'barangay', 'krimen', 'nahuli',
      'gilas', 'diskarte', 'tiyaga', 'norman mangusin',
    ]
    return signals.some((s) => t.includes(s))
  }
}
