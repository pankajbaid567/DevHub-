import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  HelpCircle, 
  Code, 
  FileText, 
  Users, 
  MessageSquare,
  BookOpen,
  Settings,
  TrendingUp
} from 'lucide-react';

const Sidebar = ({ isOpen = true, onClose }) => {
  const location = useLocation();

  const sidebarItems = [
    { 
      section: 'Main',
      items: [
        { path: '/dashboard', label: 'Dashboard', icon: Home },
        { path: '/questions', label: 'Questions', icon: HelpCircle },
        { path: '/snippets', label: 'Code Snippets', icon: Code },
        { path: '/sessions', label: 'Live Sessions', icon: MessageSquare },
      ]
    },
    {
      section: 'AI Tools',
      items: [
        { path: '/mentor', label: 'AI Mentor', icon: BookOpen },
        { path: '/resume', label: 'Resume Review', icon: FileText },
        { path: '/skills', label: 'Skill Tracker', icon: TrendingUp },
      ]
    },
    {
      section: 'Community',
      items: [
        { path: '/users', label: 'Users', icon: Users },
      ]
    }
  ];

  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-30
        w-64 bg-white dark:bg-slate-900 
        border-r border-slate-200 dark:border-slate-700
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">
          {/* Sidebar content */}
          <div className="flex-1 overflow-y-auto py-6">
            <nav className="px-3 space-y-8">
              {sidebarItems.map((section) => (
                <div key={section.section}>
                  <h3 className="px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {section.section}
                  </h3>
                  <div className="mt-3 space-y-1">
                    {section.items.map(({ path, label, icon: Icon }) => (
                      <Link
                        key={path}
                        to={path}
                        onClick={onClose}
                        className={`
                          flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
                          ${isActive(path)
                            ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }
                        `}
                      >
                        <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                        {label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>

          {/* Sidebar footer */}
          <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 p-4">
            <Link
              to="/settings"
              className="flex items-center px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Settings className="mr-3 h-5 w-5" />
              Settings
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;