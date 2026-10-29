/** Données de test (fictives). */

export function sampleRelease(overrides: Record<string, unknown> = {}) {
  return {
    release_id: "rel_2026_10_29_01",
    version: "6.4.2",
    environment: "production",
    published_at: "2026-10-29T12:38:00+01:00",
    changes: [
      { category: "tickets", description: "Alertes de ventes : suivi de 10 événements." },
      { category: "tickets", description: "Recherche dans les dossiers du stock." },
      { category: "api", description: "Fix et améliorations générales de l'API." },
      { category: "tickets", description: "Fix Multi Delisting." },
    ],
    ...overrides,
  };
}

export function sampleSale(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sale_id: "sale_123",
    livemode: true,
    status: "confirmed",
    payment_status: "succeeded",
    channel: "marketplace",
    confirmed_at: "2026-10-29T13:36:00+01:00",
    event: {
      name: "Celine Dion Nanterre",
      starts_at: "2027-05-08T20:00:00+02:00",
      venue: "Paris La Defense Arena",
      image_url: "https://cdn.eventis.example/events/123.jpg",
      url: "https://eventis.example/events/123",
    },
    tickets: { section: "105", row: "23", quantity: 2 },
    price: { amount_minor: 110000, currency: "EUR" },
    ...overrides,
  };
}
