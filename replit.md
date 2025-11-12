# Google Voice Dialer Dashboard

## Overview
This project is a web-based contact management and automated calling platform integrated with Google Voice Business. It provides a comprehensive interface for managing contacts, creating bulk calling campaigns, and executing automated dialing sequences. The platform aims for efficiency and automation in campaign-driven outreach workflows, incorporating real-time AI conversation capabilities for dynamic interactions.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework & Build System**: React 18+ with TypeScript, Vite, and Wouter for routing.
- **UI Component System**: Shadcn UI (New York variant) with Radix UI primitives, Tailwind CSS for styling, Material Design principles, and a dark mode primary theme.
- **State Management & Data Fetching**: TanStack Query for server state, custom API client, and React Hook Form with Zod validation.
- **Design System Decisions**: Inter font, 4px-based spacing, custom border radii, and a productivity-optimized color palette.

### Backend Architecture
- **Server Framework**: Express.js REST API server with TypeScript.
- **Data Layer**: Drizzle ORM for type-safe database interactions with PostgreSQL, utilizing UUID primary keys.
- **API Design**: RESTful endpoints for contacts, calls, campaigns, and AI agents, with Zod validation and consistent error handling.
- **Development Workflow**: Hot module replacement via Vite middleware and separate build processes for client and server.

### Data Models
- **Contact**: Stores contact information and timestamps.
- **Call History**: Tracks call status and links to contacts.
- **Campaign**: Manages bulk calling operations, linking to AI agents and contacts.
- **Campaign Contacts Junction**: Links campaigns to contacts with per-contact call status.
- **AI Agent**: Defines AI behavior, personality, voice, and conversation scripts.
- **Call Recording**: Stores audio recordings of calls.
- **Conversation Transcript**: Logs AI conversation messages and timestamps.

### Key Architectural Patterns
- **Monorepo Structure**: Organized with shared types in `/shared`, client code in `/client`, and server code in `/server`.
- **Type Safety**: End-to-end type inference and Zod schemas for validation.
- **Styling Strategy**: CSS custom properties for theming, Tailwind utilities, and CVA for component styling.
- **Error Handling**: Centralized error middleware, toast notifications, and query invalidation.
- **Performance Optimization**: 
  - WebSocket-driven cache updates using `setQueryData` to avoid unnecessary API refetches
  - Polling intervals set to 20-30 seconds as fallback only (campaigns detail: 20s, campaigns list: 30s)
  - Disabled `refetchOnMount` and `refetchOnWindowFocus` to prevent duplicate API calls
  - WebSocket updates both detail and list caches for real-time synchronization across all views
  - **Memory Leak Prevention**:
    - Database connection pool configured with max 20 connections and 30-second idle timeout
    - TanStack Query garbage collection set to 5 minutes to prevent infinite cache growth
    - WebSocket stale connection cleanup every 30 seconds
    - Graceful shutdown handlers to properly release all resources
    - Prevents performance degradation over time (maintains consistent 2-4ms response times)

## External Dependencies

### Third-Party UI Libraries
- **@radix-ui/**: Accessible, unstyled primitives.
- **class-variance-authority**: Variant-based component styling.
- **cmdk**: Command palette functionality.
- **embla-carousel-react**: Carousel components.
- **lucide-react**: Iconography.

### Database & ORM
- **@neondatabase/serverless**: PostgreSQL connection.
- **Drizzle ORM**: For database interactions and migrations.
- **drizzle-zod**: Schema-to-validation integration.

### Form Handling
- **react-hook-form**: Performant form state management.
- **@hookform/resolvers**: Zod schema integration.

### Development Tools
- **@replit/vite-plugin-runtime-error-modal**: Error overlay.
- **@replit/vite-plugin-cartographer**: Replit-specific development features.
- **tsx**: TypeScript execution in development.

### Google Voice + Virtual Audio Cable + ElevenLabs Integration (PRODUCTION)
- **Playwright Browser Automation**: For Google Voice login and dialing.
  - **Manual Login System**: Removed auto-login for security. Users manually login once through browser, session persists automatically.
  - **Robust Login Detection**: Multi-method verification using URL patterns, UI elements, and authentication cookies.
  - **Session Persistence**: Login state saved in persistent browser profile, eliminates need for repeated logins.
  - **Real-time Login Notifications**: 
    - Multi-layer notification system: WebSocket (instant) + 10-second polling (reliable fallback)
    - Global popup dialog accessible from any page in the app
    - Toast notifications on campaign detail page
    - Callbacks passed to `getDialer()` before browser initialization to ensure reliable triggering
    - Campaign status automatically updates to `waiting_for_login` when login is required
    - Clean, production-ready logging without verbose debug output
  - **Simplified Call State Detection** (Refactored Oct 28, 2025):
    - **Single-Signal Detection**: Uses ONE reliable signal - presence of "End call" button to determine call state
    - **Ultra-Simple Flow**: IDLE → DIALING → (wait 3s) → check button → CONNECTED/FAILED → ENDED
    - **No Complex Timers**: Removed all timer detection logic that was unreliable across Google Voice UI variations
    - **Button Detection**:
      - Waits 3 seconds after dialing to allow call to connect
      - Checks for "End call" button with aria-label and text content matching
      - If button exists → call CONNECTED → AI audio starts
      - If button missing → call FAILED → no audio
    - **Call End Detection**: While CONNECTED, polls every 500ms for button presence
      - When button disappears → call ENDED (covers all scenarios: hangup, timeout, rejection)
    - **AI Audio Timing**: Audio handler only starts after CONNECTED state (prevents premature AI responses)
    - **DOM-Safe Selectors**: Pure JavaScript selectors with exact/starts-with matching (no false positives)
- **Virtual Audio Cable Audio Routing**: Routes audio between Google Voice, Node.js, and ElevenLabs on Windows VPS.
- **ElevenLabs Speech-to-Speech AI**: Real-time AI voice conversations.
- **Audio Processing Pipeline**: WebSocket-based audio capture, transcoding, and concatenation using `fluent-ffmpeg`.
- **Call Recording & Transcripts**: Saves audio and conversation logs.
- **Bulk Campaign Dialing**: Sequential processing with 3-6 minute random delays between calls for natural pacing and robustness.