import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { 
  Home, 
  HelpCircle, 
  Code, 
  FileText, 
  User, 
  LogOut, 
  Menu, 
  X,
  Sun,
  Moon,
  MessageSquare,
  BookOpen,
  Zap,
  ChevronDown,
  Bell,
  Search
} from 'lucide-react';

const Navbar = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const { theme, toggleTheme, isCyberpunk } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Handle scroll effect for navbar
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);


  const handleLogout = () => {
    logout();
    navigate('/');
    setIsMobileMenuOpen(false);
  };


  const navItems = [
    { path: '/', label: 'Home', icon: Home, badge: null },
    { path: '/questions', label: 'Questions', icon: HelpCircle, badge: 'New' },
    { path: '/snippets', label: 'Snippets', icon: Code, badge: null },
    { path: '/sessions', label: 'Sessions', icon: MessageSquare, badge: null },
    { path: '/mentor', label: 'AI Mentor', icon: Zap, badge: 'AI', highlight: true },
  ];

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return <Moon className="h-5 w-5" />;
      case 'dark':
        return <Zap className="h-5 w-5" />;
      case 'cyberpunk':
        return <Sun className="h-5 w-5" />;
      default:
        return <Zap className="h-5 w-5" />;
    }
  };

  return (
    <nav className={`navbar ${isScrolled ? 'scrolled' : 'not-scrolled'} ${isCyberpunk ? 'cyber-glow' : ''}`}>
      <div className="navbar-container">
        <div className="navbar-content">
          {/* Logo */}
          <Link 
            to="/" 
            className="navbar-logo"
            aria-label="DevHub+ - Go to homepage"
          >
            <div className={`navbar-logo-icon ${isCyberpunk ? 'cyber-glow-blue' : ''}`} role="img" aria-label="DevHub+ logo">
              <Code className={`h-7 w-7 text-white ${isCyberpunk ? 'cyber-animate-pulse' : ''}`} aria-hidden="true" />
            </div>
            <div className="navbar-logo-text">
              <span className={`navbar-logo-title ${isCyberpunk ? 'cyber-glow-pink' : ''}`} role="text">
                DevHub+
              </span>
              <span className={`navbar-logo-subtitle ${isCyberpunk ? 'text-cyber-text-accent' : ''}`}>
                {isCyberpunk ? 'CYBER PLATFORM' : 'Developer Platform'}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="navbar-nav">
            {navItems.map(({ path, label, icon: Icon, badge, highlight }) => (
              <Link
                key={path}
                to={path}
                className={`navbar-nav-item ${isActive(path) ? 'active' : ''} ${highlight ? 'highlight' : ''}`}
                aria-current={isActive(path) ? 'page' : undefined}
                role="menuitem"
                tabIndex={0}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="relative">
                  {label}
                  {badge && (
                    <span className={`navbar-nav-badge ${badge === 'AI' ? 'ai' : 'new'}`}>
                      {badge}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>

          {/* Actions Bar */}
          <div className="navbar-actions">
            {/* Search Button */}
            <button
              className="navbar-action-btn"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>

            {/* Notifications */}
            {isAuthenticated && (
              <button
                className="navbar-action-btn navbar-notification-btn"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="navbar-notification-badge navbar-notification-badge ping"></span>
                <span className="navbar-notification-badge"></span>
              </button>
            )}

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`navbar-action-btn ${isCyberpunk ? 'cyber-glow-green' : ''}`}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : theme === 'dark' ? 'cyberpunk' : 'light'} theme`}
              title={`Current: ${theme} theme`}
            >
              {getThemeIcon()}
            </button>

            {isAuthenticated ? (
              <div className="navbar-user-menu md:flex hidden">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="navbar-user-btn"
                >
                  <div className="navbar-user-avatar">
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="hidden lg:block">{user?.name || 'User'}</span>
                  <ChevronDown className={`h-4 w-4 transition-all ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {isUserMenuOpen && (
                  <div className="navbar-user-dropdown">
                    <div className="navbar-user-info">
                      <p className="navbar-user-name">{user?.name || 'User'}</p>
                      <p className="navbar-user-email">{user?.email}</p>
                    </div>
                    <Link
                      to="/dashboard"
                      className="navbar-dropdown-item"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      <User className="h-4 w-4" />
                      <span>Dashboard</span>
                    </Link>
                    <button
                      onClick={() => {
                        handleLogout();
                        setIsUserMenuOpen(false);
                      }}
                      className="navbar-dropdown-item danger"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="navbar-actions md:flex hidden">
                <Link to="/login" className="btn btn-secondary">
                  Sign In
                </Link>
                <Link to="/register" className="btn btn-primary">
                  Get Started
                </Link>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="navbar-mobile-btn"
              aria-label={isMobileMenuOpen ? 'Close mobile menu' : 'Open mobile menu'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
              type="button"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div 
            id="mobile-menu"
            className="navbar-mobile-menu" 
            role="menu" 
            aria-label="Mobile navigation menu"
          >
            <div className="navbar-mobile-nav">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`navbar-mobile-nav-item ${isActive(path) ? 'active' : ''}`}
                  role="menuitem"
                  aria-current={isActive(path) ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}

              {isAuthenticated ? (
                <div className="navbar-mobile-auth">
                  <Link
                    to="/dashboard"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="navbar-mobile-auth-item primary"
                  >
                    <User className="h-5 w-5" />
                    <span>Dashboard</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="navbar-mobile-auth-item danger"
                  >
                    <LogOut className="h-5 w-5" />
                    <span>Logout</span>
                  </button>
                </div>
              ) : (
                <div className="navbar-mobile-auth">
                  <Link
                    to="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="navbar-mobile-auth-item secondary"
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="navbar-mobile-auth-item primary"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;