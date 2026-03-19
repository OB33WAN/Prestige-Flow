window.PrestigeFlowConfig = {
  "web3forms": {
    "accessKey": "e0280940-a74d-41e8-a0dc-1cc2d79e13ff",
    "endpoint": "https://api.web3forms.com/submit",
    "fromName": "Prestige Flow Website",
    "businessEmail": "info@prestigeflow.co.uk"
  },
  "stripe": {
    // Service-level fallback payment links.
    // Primary checkout routing now uses data/stripe-payment-link-map.json
    // with SKU mapping (service + region + time period).
    "paymentLinks": {
      "default":           "",
      "drainage":          "",
      "emergency-drainage":"",
      "plumbing":          "",
      "cctv-survey":       ""
    }
  }
};
