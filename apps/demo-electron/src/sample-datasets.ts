export type SampleDataset = {
  id: string;
  label: string;
  description: string;
  documents: string[];
};

export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'support-notes',
    label: 'Customer Support Notes',
    description: 'Recent support tickets around login, billing, and exports.',
    documents: [
      'Ticket #1482: Customer cannot reset password from mobile. Email arrives but reset link opens a blank page when tapped from iOS Mail.',
      'Ticket #1494: Billing admin says invoice PDF exports fail for accounts with more than 50 seats. CSV export succeeds.',
      'Ticket #1501: User asks for a way to filter alerts by team. They currently receive all workspace alerts in one stream.',
      'Ticket #1508: Customer reports API token rotation worked, but old token still appears in audit log as active for about 30 seconds.',
      'Ticket #1512: Enterprise customer requests SSO login troubleshooting guide for onboarding new IT admins.',
    ],
  },
  {
    id: 'product-meetings',
    label: 'Product Meeting Notes',
    description: 'Planning notes from roadmap and release check-ins.',
    documents: [
      'Roadmap sync: Prioritize semantic search in admin dashboard. PM wants first pass focused on internal docs and support notes.',
      'Release prep: Keep new onboarding wizard behind feature flag until analytics confirms completion rate improvement.',
      'Engineering standup: Background indexing pipeline needs better progress telemetry before opening beta.',
      'Design review: Compact dark theme approved for desktop tools, reduce vertical spacing in form controls by 20 percent.',
      'Go-to-market meeting: Prepare demo that contrasts cloud inference with local/Dyno path using same UI and same query workflow.',
    ],
  },
  {
    id: 'internal-docs',
    label: 'Internal Documentation Snippets',
    description: 'Operational notes and developer-facing internal docs.',
    documents: [
      'Runbook: If worker queue stalls, verify readiness endpoint and ensure machine state reports continue every 5 seconds.',
      'API note: Embedding requests should include project context in Dyno mode to enforce strategy preset scheduling.',
      'Developer guide: For local model warm starts, execute a warmup embedding after agent startup before performance measurements.',
      'Security note: Service-role keys must stay in local environment variables and never be bundled in renderer code.',
      'Architecture note: Keep embedding provider switch centralized in main process to avoid split code paths in renderer.',
    ],
  },
  {
    id: 'user-feedback',
    label: 'User Feedback Entries',
    description: 'Direct product feedback from power users.',
    documents: [
      'Feedback: Search results are accurate, but users want to see similarity scores to understand why a result ranked first.',
      'Feedback: Desktop demo should clearly state which backend is active so team members can verify mode quickly.',
      'Feedback: Index button should process sample content immediately without setup friction for live demos.',
      'Feedback: Query latency feels acceptable under one second for small document collections.',
      'Feedback: Please avoid flashy gradients; we prefer compact and serious visuals for internal tooling.',
    ],
  },
];
