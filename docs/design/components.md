# UI Component Inventory

## Reuse first
Use existing `apps/admin/src/components/` components where possible. Do not create a second parallel UI library.

## Figma UI Kit
- `OCTAGON / UI Kit / Foundations`
- Primary Button
- Secondary Button
- Text Input
- Status / Active

These are initial Figma components, not a complete published library. Additional states require design review.

## Required implementation primitives
- AppShell / Sidebar / NavItem / Topbar
- PageHeader and action area
- KPI card, metric/chart container
- Table, search, filters, pagination, empty state
- Form field with label, help, error and disabled states
- Dialog and destructive confirmation
- Loading skeleton, success/error notices
- Status badge with textual status
- Mobile card list replacing wide tables

## Accessibility
- Visible focus states and keyboard navigation
- Minimum practical touch target 44px
- Error text associated with field
- Never convey status by color alone
- Dialog focus management
- Screen-reader labels on icon-only controls

## Logo
The source image is not an approved brand asset. Keep existing OCTAGON wordmark/placeholder until user approves a reconstructed logo. Do not silently import a generated approximation.
