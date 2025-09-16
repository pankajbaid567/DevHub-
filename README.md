# DevHub+ 🚀

A comprehensive full-stack developer platform built with modern web technologies. DevHub+ provides a complete ecosystem for developers to learn, collaborate, and grow their skills through Q&A, code sharing, real-time sessions, and AI-powered mentoring.

## Project Structure

```
DevHub+/
├── frontend/          # React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/        # Page components
│   │   └── ...
│   └── package.json
├── backend/           # Node.js + Express + Prisma
│   ├── prisma/       # Database schema and migrations
│   ├── server.js     # Main server file
│   └── package.json
├── .env.example      # Environment variables template
└── README.md
```

## Tech Stack

### Frontend
- **React** - UI library
- **Vite** - Build tool and development server
- **Tailwind CSS** - Utility-first CSS framework
- **React Router DOM** - Client-side routing

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **Prisma** - Database ORM
- **PostgreSQL** - Database
- **Socket.io** - Real-time communication
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **CORS** - Cross-origin resource sharing

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL database
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd DevHub+
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your actual database URL and secrets
   ```

3. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   ```

4. **Install backend dependencies**
   ```bash
   cd ../backend
   npm install
   ```

5. **Set up the database**
   ```bash
   # Generate Prisma client
   npx prisma generate
   
   # Run database migrations
   npx prisma migrate dev --name init
   ```

### Development

1. **Start the backend server**
   ```bash
   cd backend
   npm run dev
   ```
   Server will run on http://localhost:3000

2. **Start the frontend development server**
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend will run on http://localhost:5173

### ✨ Features

#### 🏠 **Landing Experience**
- **Modern Home Page**: Hero section with community stats and feature showcase
- **Authentication-Aware Navigation**: Dynamic content based on login status
- **Dark Mode Support**: System preference detection with manual toggle

#### 🔐 **Authentication System**
- **Secure Login/Register**: Form validation, password strength indicators
- **JWT Token Management**: Automatic token refresh and secure storage
- **Protected Routes**: Authentication guards with redirect handling
- **Social Login Ready**: GitHub integration placeholder

#### ❓ **Questions & Community**
- **Q&A Platform**: Community-driven question and answer system
- **Advanced Search**: Filter by tags, status, and popularity
- **Reputation System**: Vote tracking and user rankings
- **Rich Content**: Code snippet support in questions/answers

#### 💻 **Code Sharing**
- **Snippet Library**: Share and discover code snippets
- **Multi-Language Support**: Syntax highlighting for 20+ languages  
- **Copy-to-Clipboard**: One-click code copying
- **Star System**: Community-curated quality ratings

#### 🎯 **Live Collaboration**
- **Real-Time Sessions**: Multi-user coding sessions with voice/video
- **Live Code Editor**: Monaco editor with collaborative features
- **Session Management**: Host controls, participant limits, scheduling
- **Integrated Chat**: Live messaging during sessions

#### 🤖 **AI-Powered Mentoring**
- **Smart Code Review**: AI analysis with improvement suggestions
- **Personalized Learning**: Custom roadmaps based on skill level
- **Career Guidance**: Resume review and interview preparation
- **Context-Aware Help**: Google Gemini AI integration

#### 📊 **Analytics Dashboard**
- **User Statistics**: Questions asked, reputation earned, streaks
- **Activity Timeline**: Recent contributions and achievements
- **Community Metrics**: Leaderboards and ranking system
- **Quick Actions**: Shortcuts to create content and join sessions

### 🛠️ API Endpoints

#### Authentication
- `POST /auth/register` - User registration with validation
- `POST /auth/login` - User login with JWT tokens
- `GET /auth/me` - Current user profile
- `POST /auth/logout` - Secure logout

#### AI Features
- `POST /ai/mentor` - AI mentoring conversations
- `POST /ai/resumeReview` - Resume analysis and feedback
- `POST /ai/skillRater` - Skill assessment and roadmaps

#### Content Management
- `GET /questions` - List questions with filtering
- `POST /questions` - Create new questions
- `GET /snippets` - Browse code snippets
- `POST /snippets` - Share code snippets

### 📱 Pages & Components

#### Core Pages
- **Home** (`/`) - Modern landing with feature showcase
- **Login** (`/login`) - Secure authentication with social options
- **Register** (`/register`) - Comprehensive registration with validation
- **Dashboard** (`/dashboard`) - Personalized user analytics and quick actions
- **Questions** (`/questions`) - Community Q&A with advanced search
- **Snippets** (`/snippets`) - Code sharing library with syntax highlighting
- **Sessions** (`/sessions`) - Live collaborative coding sessions
- **AI Mentor** (`/mentor`) - Personalized AI guidance and code review

#### Reusable Components
- **Card**: Consistent container with hover effects
- **Navbar**: Responsive navigation with theme toggle
- **Editor**: Monaco-powered code editor
- **ChatBox**: Real-time messaging component
- **ProtectedRoute**: Authentication guard wrapper

### Environment Variables

Create a `.env` file in the root directory based on `.env.example`:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/devhubplus?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
GEMINI_API_KEY="your-gemini-api-key-here"
PORT=3000
```

### Available Scripts

#### Frontend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

#### Backend
- `npm run dev` - Start development server with hot reload
- `npm start` - Start production server
- `npx prisma generate` - Generate Prisma client
- `npx prisma migrate dev` - Run database migrations
- `npx prisma studio` - Open Prisma Studio (database GUI)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License