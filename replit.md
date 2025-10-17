# Google Voice Dialer Dashboard

## Overview

A web-based contact management and click-to-call dashboard designed for Google Voice integration. The application provides a clean, utility-focused interface for managing contacts, tracking call history, and initiating calls through Google Voice with a single click. Built with a focus on efficiency and rapid workflow execution.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18+ with TypeScript for type-safe component development
- Vite as the build tool and development server
- Wouter for lightweight client-side routing (single-page application with Dashboard and NotFound routes)

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
- Call history tracking endpoints (`/api/call-history`)
- Validation using Zod schemas at API boundaries
- Consistent error handling with status codes and JSON error responses

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
- Client-side URL generation for Google Voice web dialer (`getGoogleVoiceDialUrl` utility)
- Click-to-call functionality via external link opening
- No server-side Google Voice API integration (browser-based workflow)

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