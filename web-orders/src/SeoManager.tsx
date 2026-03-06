import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const DEFAULT_SITE_URL = 'https://reelagad.com'
const DEFAULT_OG_IMAGE_PATH = '/infographic.png'

type SeoConfig = {
    title: string
    description: string
    canonicalPath: string
    robots: 'index,follow' | 'noindex,nofollow'
}

function resolveSiteUrl(): string {
    const configured = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim()
    const base = configured || DEFAULT_SITE_URL
    return base.replace(/\/+$/, '')
}

function resolveSeo(pathname: string): SeoConfig {
    if (pathname === '/') {
        return {
            title: 'ReelAgad | Captions & Voiceover On Demand',
            description:
                'Create polished short-form videos with captions and voiceover in minutes. ReelAgad helps you turn scripts or clips into publish-ready reels fast.',
            canonicalPath: '/',
            robots: 'index,follow',
        }
    }

    if (pathname === '/showcase') {
        return {
            title: 'ReelAgad Showcase | Sample Caption & Voiceover Reels',
            description:
                'Browse real ReelAgad outputs to see how captions, narration, and styling look before you order.',
            canonicalPath: '/showcase',
            robots: 'index,follow',
        }
    }

    if (pathname === '/pricing') {
        return {
            title: 'ReelAgad Pricing | Caption & Voiceover Packages',
            description:
                'View ReelAgad pricing for script-based and clip-based reel production with captions and voiceover options.',
            canonicalPath: '/pricing',
            robots: 'index,follow',
        }
    }

    if (pathname === '/faq') {
        return {
            title: 'ReelAgad FAQ | How ReelAgad Works',
            description:
                'Get answers about ordering, pricing, payment, delivery timelines, and reel generation workflow in ReelAgad.',
            canonicalPath: '/faq',
            robots: 'index,follow',
        }
    }

    if (pathname === '/order') {
        return {
            title: 'Order a Reel | ReelAgad',
            description:
                'Place your ReelAgad order and turn your script or clip into a polished video with captions and optional narration.',
            canonicalPath: '/order',
            robots: 'index,follow',
        }
    }

    if (pathname.startsWith('/receipt/')) {
        return {
            title: 'Order Receipt | ReelAgad',
            description: 'View your ReelAgad order payment and processing receipt.',
            canonicalPath: '/order',
            robots: 'noindex,nofollow',
        }
    }

    return {
        title: 'ReelAgad | Captions & Voiceover On Demand',
        description:
            'Create polished short-form videos with captions and voiceover in minutes using ReelAgad.',
        canonicalPath: '/',
        robots: 'noindex,nofollow',
    }
}

function setMetaTag(attribute: 'name' | 'property', key: string, content: string): void {
    const selector = `meta[${attribute}="${key}"]`
    let element = document.head.querySelector<HTMLMetaElement>(selector)

    if (!element) {
        element = document.createElement('meta')
        element.setAttribute(attribute, key)
        document.head.appendChild(element)
    }

    element.setAttribute('content', content)
}

function setCanonical(url: string): void {
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonical) {
        canonical = document.createElement('link')
        canonical.setAttribute('rel', 'canonical')
        document.head.appendChild(canonical)
    }

    canonical.setAttribute('href', url)
}

function setJsonLd(siteUrl: string, canonicalUrl: string, description: string): void {
    const payload = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Organization',
                '@id': `${siteUrl}/#organization`,
                name: 'ReelAgad',
                url: siteUrl,
                logo: `${siteUrl}/logo.svg`,
            },
            {
                '@type': 'WebSite',
                '@id': `${siteUrl}/#website`,
                name: 'ReelAgad',
                url: siteUrl,
                inLanguage: 'en',
                publisher: {
                    '@id': `${siteUrl}/#organization`,
                },
            },
            {
                '@type': 'Service',
                '@id': `${canonicalUrl}#service`,
                serviceType: 'Short-form video caption and voiceover service',
                provider: {
                    '@id': `${siteUrl}/#organization`,
                },
                areaServed: 'PH',
                url: canonicalUrl,
                description,
            },
        ],
    }

    let script = document.head.querySelector<HTMLScriptElement>('script[data-seo-jsonld="reelagad"]')
    if (!script) {
        script = document.createElement('script')
        script.setAttribute('type', 'application/ld+json')
        script.setAttribute('data-seo-jsonld', 'reelagad')
        document.head.appendChild(script)
    }

    script.textContent = JSON.stringify(payload)
}

export function SeoManager() {
    const location = useLocation()

    useEffect(() => {
        const siteUrl = resolveSiteUrl()
        const seo = resolveSeo(location.pathname)
        const canonicalUrl = `${siteUrl}${seo.canonicalPath}`
        const ogImage = `${siteUrl}${DEFAULT_OG_IMAGE_PATH}`

        document.title = seo.title

        setMetaTag('name', 'description', seo.description)
        setMetaTag('name', 'robots', seo.robots)
        setMetaTag('name', 'googlebot', seo.robots)

        setMetaTag('property', 'og:site_name', 'ReelAgad')
        setMetaTag('property', 'og:type', 'website')
        setMetaTag('property', 'og:locale', 'en_PH')
        setMetaTag('property', 'og:title', seo.title)
        setMetaTag('property', 'og:description', seo.description)
        setMetaTag('property', 'og:url', canonicalUrl)
        setMetaTag('property', 'og:image', ogImage)
        setMetaTag('property', 'og:image:alt', 'ReelAgad short-form video creation preview')

        setMetaTag('name', 'twitter:card', 'summary_large_image')
        setMetaTag('name', 'twitter:title', seo.title)
        setMetaTag('name', 'twitter:description', seo.description)
        setMetaTag('name', 'twitter:image', ogImage)

        setCanonical(canonicalUrl)
        setJsonLd(siteUrl, canonicalUrl, seo.description)
    }, [location.pathname])

    return null
}
