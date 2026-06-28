/* ─── TwinWaves Invoice Generator — Config ─────────
   Single source of truth for company data and plans.
   ─────────────────────────────────────────────────── */

const TW = Object.freeze({
  company: {
    name:    'TwinWaves Digital',
    tagline: 'Automate · Innovate · Elevate',
    email:   'twinwavesdigital@gmail.com',
    phone1:  '+91 70345 25123',
    phone2:  '+91 80899 30247',
  },

  plans: {
    starter: {
      id:       'starter',
      tier:     'STARTER',
      name:     'Starter Plan',
      price:    79,
      features: [
        'Missed-Call Text-Back Automation',
        '1 Business Number',
        'Basic Setup & Configuration',
      ],
    },
    growth: {
      id:       'growth',
      tier:     'GROWTH',
      name:     'Growth Plan',
      price:    149,
      features: [
        'Everything in Starter',
        'Custom Message Personalisation',
        'Lead Capture Integration',
        'After-Hours Automation',
      ],
    },
    custom: {
      id:       'custom',
      tier:     'CUSTOM',
      name:     'Custom Solution',
      price:    null,
      features: [
        'Tailored Automation Workflow',
        'Custom Business Integrations',
        'Dedicated Setup & Onboarding',
        'Flexible Coverage Options',
      ],
    },
  },

  service: 'Missed-Call Text-Back Automation',

  paymentTerms: [
    'Payment due within 7 days of invoice date.',
    'Accepted: Bank Transfer  ·  UPI  ·  NEFT / RTGS',
  ],

  logos: {
    icon: 'logo-icon.png',  // W/wings mark only  → dark PDF header + app UI
    full: 'logo-full.png',  // TWINWAVES full logo → light PDF header
  },
});
