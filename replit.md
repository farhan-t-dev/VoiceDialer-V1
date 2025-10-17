# Google Voice Dialer Dashboard

## Overview

A web-based contact management and automated calling platform designed for Google Voice Business integration. The application provides a comprehensive interface for managing contacts, creating bulk calling campaigns, and executing automated dialing sequences. Built with a focus on efficiency, automation, and campaign-driven outreach workflows.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18+ with TypeScript for type-safe component development
- Vite as the build tool and development server
- Wouter for lightweight client-side routing with multiple pages:
  - Home (/) - Dashboard overview with stats and quick actions
  - Contacts (/contacts) - Full contact management interface with CSV import and tagging
  - Campaigns (/campaigns) - Campaign list and creation with AI agent integration
  - Campaign Detail (/campaigns/:id) - Individual campaign management with contact selection and bulk dialing
  - AI Agents (/agents) - Manage AI agent profiles for automated conversations
  - Analytics (/analytics) - Call history analytics and reporting
  - Settings (/settings) - Configure ElevenLabs and Google Voice credentials

**UI Component System**
- Shadcn UI component library (New York variant) with Radix UI primitives
- Tailwind CSS for styling with custom design tokens
- Material Design principles with Linear-inspired minimalism
- Dark mode as primary theme with light mode support via ThemeProvider context
- Custom color system using HSL values with CSS variables for theme switching

**State Management & Data Fetching**
- TanStack Query (React Query) for server state management
- Custom API client wrapper (`apiRequest`) for REST endpoints
- React Hook Form with Zod validation for form state
- Local component state for UI interactions (dialogs, selections)

**Design System Decisions**
- Typography: Inter font family for UI text, JetBrains Mono for phone numbers
- Spacing: Tailwind's 4px-based scale (units of 2, 4, 6, 8, 12)
- Border radius: Custom values (9px, 6px, 3px) for consistent visual language
- Color palette optimized for productivity with vibrant blue primary actions and semantic colors for call states

### Backend Architecture

**Server Framework**
- Express.js REST API server
- TypeScript with ES modules
- Custom request logging middleware tracking API response times and payload data

**Data Layer**
- Drizzle ORM for database interactions with type-safe query building
- Schema-first design with Zod validation schemas derived from Drizzle tables
- In-memory storage implementation (`MemStorage`) for development/testing
- Database schema supports PostgreSQL with UUID primary keys

**API Design**
- RESTful endpoints for contacts CRUD operations (`/api/contacts`)
- Call history tracking endpoints (`/api/calls`)
- Campaign management endpoints (`/api/campaigns`) for creating and managing bulk calling campaigns
- Campaign contact endpoints (`/api/campaigns/:id/contacts`) for adding contacts to campaigns
- Bulk automated dialing endpoint (`/api/campaigns/:id/dial`) for executing campaigns
- AI Agent CRUD endpoints (`/api/agents`) for managing conversation profiles
- Call recording endpoints (`/api/calls/:id/recording`) for storing audio recordings
- Conversation transcript endpoints (`/api/calls/:id/transcripts`) for AI conversation logs
- Validation using Zod schemas at API boundaries
- Consistent error handling with status codes and JSON error responses
- Asynchronous background processing for bulk dialing operations

**Development Workflow**
- Hot module replacement (HMR) in development via Vite middleware
- Separate build processes for client (Vite) and server (esbuild)
- Type checking without emit (`noEmit: true` in tsconfig)

### Data Models

**Contact Entity**
- Core fields: id (UUID), name, phone (required), email, company, notes
- Automatic timestamp tracking (createdAt)
- Cascading delete relationship with call history

**Call History Entity**
- Links to contact via foreign key with cascade delete
- Status tracking: completed, missed, voicemail, busy
- Timestamp (calledAt) and optional notes per call
- Visual indicators with color-coded icons per status type

**Campaign Entity**
- Core fields: id (UUID), name (required), description, agentId (optional), status, createdAt
- Status states: draft, active, completed, paused
- Links to AI Agent for automated conversation handling
- Many-to-many relationship with contacts via junction table
- Enables bulk calling operations with centralized management

**Campaign Contacts Junction Table**
- Links campaigns to contacts with individual call tracking
- Per-contact status: pending, calling, completed, failed
- Timestamp tracking (calledAt) and notes for each campaign contact
- Cascading deletes when campaign or contact is removed

**AI Agent Entity**
- Core fields: id (UUID), name, personality, voiceId (ElevenLabs), conversationScript
- Additional fields: greeting, objectionHandling, closingScript, isActive, createdAt
- Defines AI behavior and conversation flow for automated calls
- Can be assigned to campaigns for AI-powered conversations

**Call Recording Entity**
- Links to call history with recording URL and duration
- Stores audio recordings of calls for playback and analysis
- Cascading delete when call history is removed

**Conversation Transcript Entity**
- Links to call history with speaker (agent/contact) and message
- Timestamp tracking for conversation flow
- Enables transcript review and conversation analysis

### External Dependencies

**Third-Party UI Libraries**
- @radix-ui/* family for accessible, unstyled primitives (dialogs, dropdowns, popovers, etc.)
- class-variance-authority for variant-based component styling
- cmdk for command palette functionality
- embla-carousel-react for carousel components
- lucide-react for consistent iconography

**Database & ORM**
- @neondatabase/serverless for PostgreSQL connection (configured but adaptable)
- Drizzle ORM (v0.39.1) with Drizzle Kit for migrations
- drizzle-zod for schema-to-validation integration

**Form Handling**
- react-hook-form for performant form state management
- @hookform/resolvers for Zod schema integration
- Validation schemas enforce required fields and format constraints

**Development Tools**
- @replit/vite-plugin-runtime-error-modal for error overlay
- @replit/vite-plugin-cartographer and dev-banner for Replit-specific development features
- tsx for TypeScript execution in development

**Google Voice Integration**
- Playwright-based browser automation for Google Voice Business (`google-voice-automation.ts`)
- Automated login and dialing without manual browser interaction
- Server-side automated dialing endpoint (`/api/dial/automated`)
- Bulk campaign dialing with sequential processing and status tracking
- Requires GOOGLE_VOICE_EMAIL and GOOGLE_VOICE_PASSWORD environment variables
- 5-second delay between calls to prevent system overload

**ElevenLabs Speech-to-Speech Integration (Planned)**
- AI-powered voice conversations during automated calls
- Speech-to-speech API for real-time conversation handling
- Voice customization using ElevenLabs voice IDs in AI agent profiles
- Requires ELEVENLABS_API_KEY environment variable
- Settings page provides credential configuration interface
- Integration pending: Full implementation with Google Voice automation

### Key Architectural Patterns

**Monorepo Structure**
- Shared types and schemas in `/shared` directory
- Client code in `/client` with path aliases (@/, @shared)
- Server code in `/server` with separation of routes and storage logic

**Type Safety**
- End-to-end type inference from database schema to React components
- Zod schemas provide runtime validation and TypeScript type generation
- Shared types prevent client-server contract drift

**Styling Strategy**
- CSS custom properties for dynamic theming
- Tailwind utility classes with custom configuration
- Component-level style encapsulation with CVA (class-variance-authority)
- Elevation system using semi-transparent overlays for hover/active states

**Error Handling**
- Centralized error middleware in Express
- Toast notifications for user-facing errors
- Query invalidation on mutation success for cache consistency