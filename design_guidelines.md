# Design Guidelines: Google Voice Dialer Dashboard

## Design Approach
**System Selected**: Material Design with Linear-inspired minimalism
**Rationale**: Utility-focused productivity tool requiring efficiency, clarity, and data hierarchy. Clean interface optimized for rapid contact access and calling workflow.

---

## Core Design Elements

### A. Color Palette

**Dark Mode (Primary)**
- Background: 220 15% 12% (deep slate)
- Surface: 220 15% 16% (elevated cards)
- Surface Hover: 220 15% 20%
- Primary Action: 210 100% 60% (vibrant blue for call buttons)
- Primary Hover: 210 100% 55%
- Success: 142 76% 45% (call connected states)
- Destructive: 0 84% 60% (delete actions)
- Text Primary: 0 0% 98%
- Text Secondary: 220 10% 65%
- Border: 220 15% 25%

**Light Mode**
- Background: 0 0% 98%
- Surface: 0 0% 100%
- Primary Action: 210 100% 50%
- Text Primary: 220 15% 15%
- Text Secondary: 220 10% 45%
- Border: 220 15% 90%

### B. Typography
- **Primary Font**: Inter (Google Fonts)
- **Monospace**: JetBrains Mono (for phone numbers)
- **Hierarchy**:
  - Page Headers: text-2xl font-semibold
  - Section Headers: text-lg font-medium
  - Contact Names: text-base font-medium
  - Phone Numbers: text-sm font-mono
  - Metadata: text-xs text-secondary

### C. Layout System
**Spacing Primitives**: Tailwind units of 2, 4, 6, 8, and 12
- Component padding: p-4 to p-6
- Section gaps: gap-6 to gap-8
- Card spacing: space-y-4
- Dense tables: py-3 px-4

**Grid Structure**:
- Dashboard: Two-column (2/3 contacts list + 1/3 details panel)
- Contacts table: Full-width with fixed column widths
- Mobile: Single column stack

### D. Component Library

**Navigation**
- Top nav bar: h-16, sticky with backdrop-blur
- Logo + search bar + quick actions layout
- User profile dropdown (top right)

**Contact List/Table**
- Striped rows with hover states
- Columns: Avatar, Name, Phone, Last Called, Quick Actions
- Row height: h-16 for touch-friendly interaction
- Sticky header with sort indicators

**Contact Cards** (Detail View)
- Avatar (12x12 grid units), large phone display
- Primary "Call Now" button (w-full, prominent)
- Secondary actions: Edit, Delete, Add Note
- Call history timeline below

**Action Buttons**
- Primary Call: Rounded, blue, with phone icon
- Secondary: outline variant with subtle background
- Icon buttons: Ghost style for table actions
- Floating Action Button: Bottom right for "Add Contact"

**Forms**
- Inline editing for quick updates
- Modal dialogs for new contact creation
- Input fields: rounded-md, focus ring on primary color
- Phone input: Auto-formatting with country code dropdown

**Search & Filters**
- Prominent search bar in header (w-96)
- Filter chips below (Recently Called, Favorites, All)
- Real-time search with debouncing

**Call History**
- Timeline design with connector lines
- Each entry: timestamp, duration, notes preview
- Status indicators: color-coded dots (green=completed, red=missed)

**Data Displays**
- Stats cards: Total Calls, Avg Duration, Success Rate
- Minimal charts if needed (spark lines only)

### E. Interactions

**Micro-interactions**
- Button press: Subtle scale (scale-95 on active)
- Row hover: Elevated shadow and background shift
- Loading states: Skeleton screens for contact list
- Toasts: Top-right corner for confirmations

**Call Flow**
1. Click "Call" → Opens Google Voice in new tab
2. Log call automatically with timestamp
3. Optional note field appears after call
4. Update contact's "Last Called" immediately

---

## Page Structure

### Dashboard Layout
**Header** (h-16, sticky)
- Logo + App name
- Search bar (centered, w-96)
- Add Contact button + Settings icon

**Main Content** (grid lg:grid-cols-3)
- **Left Panel (col-span-2)**: 
  - Filter tabs
  - Contact table with infinite scroll
  - Bulk actions toolbar (when selecting multiple)

- **Right Panel (col-span-1)**:
  - Contact detail card (when selected)
  - Quick dial pad
  - Recent activity feed

**No Hero Section**: Utility app starts directly with functional interface

---

## Special Considerations

**Click-to-Call UX**
- Primary call button clearly labeled "Call via Google Voice"
- Opens in new tab with proper parameters
- Fallback: Copy number + instructions if GV not available

**Data Density**
- Compact table view for scanning many contacts
- Expandable rows for notes/details (optional expand icon)
- Balance: Information-rich but not cluttered

**Responsive Strategy**
- Desktop: Two-panel layout
- Tablet: Stacked panels, collapsible detail view
- Mobile: Single column, bottom sheet for details

**Performance**
- Virtual scrolling for 1000+ contacts
- Lazy load call history
- Optimistic UI updates

---

## Images
**No Hero Images**: This is a utility dashboard, not a marketing page
**Avatar Placeholders**: Use initials in colored circles (automatic color from name hash)
**Empty States**: Simple illustrations for "No contacts yet" screens