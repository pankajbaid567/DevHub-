import { lazy, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from './lib/queryClient';
import { ThemeProvider } from './theme/ThemeProvider';
import { useTheme } from './theme/context';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';

// Route-level code splitting: each page (and heavy deps like Monaco) loads on demand.
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));
const AuthCallback = lazy(() => import('./pages/auth/AuthCallback'));
const Search = lazy(() => import('./pages/Search'));
const Moderation = lazy(() => import('./pages/admin/Moderation'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Questions = lazy(() => import('./pages/questions/QuestionList'));
const QuestionDetail = lazy(() => import('./pages/questions/QuestionDetail'));
const AskQuestion = lazy(() => import('./pages/questions/AskQuestion'));
const Snippets = lazy(() => import('./pages/snippets/SnippetList'));
const SnippetDetail = lazy(() => import('./pages/snippets/SnippetDetail'));
const SnippetEditor = lazy(() => import('./pages/snippets/SnippetEditor'));
const Sessions = lazy(() => import('./pages/sessions/SessionList'));
const NewSession = lazy(() => import('./pages/sessions/NewSession'));
const SessionRoom = lazy(() => import('./pages/sessions/SessionRoom'));
const SessionReplay = lazy(() => import('./pages/sessions/SessionReplay'));
const InterviewHistory = lazy(() => import('./pages/InterviewHistory'));
const Practice = lazy(() => import('./pages/Practice'));
const Whiteboard = lazy(() => import('./pages/Whiteboard'));
const Mentor = lazy(() => import('./pages/Mentor'));
const Career = lazy(() => import('./pages/Career'));
const Profile = lazy(() => import('./pages/Profile'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const AssessmentDashboard = lazy(() => import('./pages/assessments/AssessmentDashboard'));
const CreateAssessment = lazy(() => import('./pages/assessments/CreateAssessment'));
const TakeAssessment = lazy(() => import('./pages/assessments/TakeAssessment'));
const AssessmentDetail = lazy(() => import('./pages/assessments/AssessmentDetail'));
const AssessmentAnalytics = lazy(() => import('./pages/assessments/AssessmentAnalytics'));
const TeamManagement = lazy(() => import('./pages/assessments/TeamManagement'));
const NotFound = lazy(() => import('./pages/NotFound'));

const guard = (el: ReactNode) => <RequireAuth>{el}</RequireAuth>;

function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved === 'light' ? 'light' : 'dark'}
      position="bottom-right"
      richColors
      closeButton
    />
  );
}

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />
                <Route path="forgot-password" element={<ForgotPassword />} />
                <Route path="reset-password" element={<ResetPassword />} />
                <Route path="verify-email" element={<VerifyEmail />} />
                <Route path="auth/callback" element={<AuthCallback />} />
                <Route path="search" element={<Search />} />
                <Route path="admin/moderation" element={guard(<Moderation />)} />
                <Route path="dashboard" element={guard(<Dashboard />)} />
                <Route path="questions" element={<Questions />} />
                <Route path="questions/ask" element={guard(<AskQuestion />)} />
                <Route path="questions/:id" element={<QuestionDetail />} />
                <Route path="questions/:id/edit" element={guard(<AskQuestion />)} />
                <Route path="snippets" element={<Snippets />} />
                <Route path="snippets/new" element={guard(<SnippetEditor />)} />
                <Route path="snippets/:id" element={<SnippetDetail />} />
                <Route path="snippets/:id/edit" element={guard(<SnippetEditor />)} />
                <Route path="sessions" element={<Sessions />} />
                <Route path="sessions/new" element={guard(<NewSession />)} />
                <Route path="sessions/:id" element={guard(<SessionRoom />)} />
                <Route path="sessions/:id/replay" element={guard(<SessionReplay />)} />
                <Route path="practice" element={<Practice />} />
                <Route path="whiteboard/:id" element={guard(<Whiteboard />)} />
                <Route path="whiteboard/new" element={guard(<Whiteboard />)} />
                <Route path="interviews" element={guard(<InterviewHistory />)} />
                <Route path="mentor" element={guard(<Mentor />)} />
                <Route path="mentor/:id" element={guard(<Mentor />)} />
                <Route path="career" element={guard(<Career />)} />
                <Route path="u/:username" element={<Profile />} />
                <Route path="leaderboard" element={<Leaderboard />} />
                <Route path="assessments" element={guard(<AssessmentDashboard />)} />
                <Route path="assessments/:orgId" element={guard(<AssessmentDashboard />)} />
                <Route path="assessments/:orgId/new" element={guard(<CreateAssessment />)} />
                <Route path="assessments/:orgId/team" element={guard(<TeamManagement />)} />
                <Route path="assessments/:orgId/a/:assessmentId" element={guard(<AssessmentDetail />)} />
                <Route path="assessments/:orgId/a/:assessmentId/analytics" element={guard(<AssessmentAnalytics />)} />
                <Route path="assess/:token" element={<TakeAssessment />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
          <ThemedToaster />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
