import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Questions from './pages/Questions';
import Snippets from './pages/Snippets';
import Sessions from './pages/Sessions';
import Mentor from './pages/Mentor';
import NotFound from './pages/NotFound';
import Resume from './pages/Resume';
import Skills from './pages/Skills';
import NewQuestion from './pages/NewQuestion';
import QuestionDetail from './pages/QuestionDetail';
import NewSnippet from './pages/NewSnippet';
import SnippetDetail from './pages/SnippetDetail';
import NewSession from './pages/NewSession';
import SessionRoom from './pages/SessionRoom';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/questions" element={<Questions />} />
              <Route 
                path="/questions/new" 
                element={
                  <ProtectedRoute>
                    <NewQuestion />
                  </ProtectedRoute>
                } 
              />
              <Route path="/questions/:id" element={<QuestionDetail />} />
              <Route path="/snippets" element={<Snippets />} />
              <Route 
                path="/snippets/new" 
                element={
                  <ProtectedRoute>
                    <NewSnippet />
                  </ProtectedRoute>
                } 
              />
              <Route path="/snippets/:id" element={<SnippetDetail />} />
              <Route 
                path="/sessions/new" 
                element={
                  <ProtectedRoute>
                    <NewSession />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/sessions/:id" 
                element={
                  <ProtectedRoute>
                    <SessionRoom />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/resume" 
                element={
                  <ProtectedRoute>
                    <Resume />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/skills" 
                element={
                  <ProtectedRoute>
                    <Skills />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/skill" 
                element={
                  <ProtectedRoute>
                    <Skills />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/sessions" 
                element={
                  <ProtectedRoute>
                    <Sessions />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/mentor" 
                element={
                  <ProtectedRoute>
                    <Mentor />
                  </ProtectedRoute>
                } 
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
