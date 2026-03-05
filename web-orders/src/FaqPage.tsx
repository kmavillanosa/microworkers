const FAQs = [
    {
        question: 'How long does it take to get my reel?',
        answer: 'Most orders are processed quickly after payment, depending on queue and video length.',
    },
    {
        question: 'Can I use my own video clip?',
        answer: 'Yes. On the order page, upload your own video or choose one from the provided clips.',
    },
    {
        question: 'How is pricing computed?',
        answer: 'Pricing is based on frames generated from your script and selected audio tier.',
    },
    {
        question: 'What do I get after completion?',
        answer: 'You can download your generated reel and related files from your receipt page.',
    },
]

export default function FaqPage() {
    return (
        <div className="container">
            <div className="card">
                <h1>FAQ</h1>
                <p className="muted">Basic answers to common questions.</p>

                {FAQs.map((item) => (
                    <details key={item.question} style={{ marginBottom: '0.75rem' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{item.question}</summary>
                        <p style={{ margin: '0.5rem 0 0', color: 'var(--color-text-secondary)' }}>{item.answer}</p>
                    </details>
                ))}
            </div>
        </div>
    )
}
