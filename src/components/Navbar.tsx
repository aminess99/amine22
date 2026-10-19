import React, { useState } from 'react';
import { 
  Sparkles, 
  Layers, 
  Zap, 
  HelpCircle, 
  Mail, 
  Video, 
  Menu, 
  X,
  ChevronLeft,
  User as UserIcon,
  LogOut,
  FolderOpen,
  Scissors,
  Download
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { BRAND } from '../brand';
import { useInstall } from '../pwa';

export type PageTab = 'home' | 'editor' | 'templates' | 'features' | 'pricing' | 'help' | 'privacy' | 'terms' | 'contact';

interface NavbarProps {
  currentPage: PageTab;
  onNavigate: (page: PageTab) => void;
  onStartVideo?: () => void;
  onOpenSavedProjects?: () => void;
}

export function Navbar({ currentPage, onNavigate, onStartVideo, onOpenSavedProjects }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const { user, openAuthModal, logout } = useAuth();
  const { mode: installMode, install } = useInstall();

  const navItems: { id: PageTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'home', label: 'الرئيسية', icon: Video },
    { id: 'editor', label: 'المحرر', icon: Scissors },
    { id: 'features', label: 'المميزات', icon: Zap },
    { id: 'templates', label: 'القوالب', icon: Layers },
    { id: 'help', label: 'المساعدة', icon: HelpCircle },
    { id: 'contact', label: 'تواصل معنا', icon: Mail },
  ];

  const handleNavClick = (page: PageTab) => {
    onNavigate(page);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
        
        {/* Brand Logo */}
        <button 
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-3 group text-right cursor-pointer"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-600/30 group-hover:scale-105 transition-transform">
            M
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold tracking-tight text-base sm:text-lg text-white group-hover:text-indigo-300 transition-colors">
                {BRAND.name}
              </span>
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hidden sm:inline-block">
                عربي
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              {BRAND.tagline}
            </p>
          </div>
        </button>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800/60">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer",
                  isActive 
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25 font-bold" 
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Actions & User Auth */}
        <div className="flex items-center gap-2 sm:gap-3">
          {currentPage !== 'home' && (
            <button
              onClick={() => handleNavClick('editor')}
              className="hidden lg:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>ابدأ التحرير</span>
            </button>
          )}

          {/* User Profile / Login Button */}
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 transition-colors cursor-pointer"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'صورة الحساب'}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-xs flex items-center justify-center">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="hidden sm:inline text-xs font-semibold max-w-[100px] truncate text-right">
                  {user.displayName || user.email?.split('@')[0]}
                </span>
              </button>

              {/* Dropdown Menu */}
              {userDropdownOpen && (
                <div 
                  className="absolute left-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 text-right"
                  dir="rtl"
                >
                  <div className="px-3 py-2 border-b border-slate-800 mb-1">
                    <p className="text-xs font-bold text-white truncate">
                      {user.displayName || 'مستخدم مسجل'}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {user.email}
                    </p>
                  </div>
                  
                  {onOpenSavedProjects && (
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onOpenSavedProjects();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer mb-1"
                    >
                      <FolderOpen className="w-4 h-4 text-indigo-400" />
                      <span>مشاريعي المحفوظة</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      logout();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>تسجيل الخروج</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={openAuthModal}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span>تسجيل الدخول</span>
            </button>
          )}

          {/* Mobile Menu Trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors"
            aria-label="القائمة"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-950 border-b border-slate-800 p-4 space-y-2 animate-in slide-in-from-top duration-200">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={cn(
                  "w-full px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors",
                  isActive 
                    ? "bg-indigo-600 text-white font-bold" 
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-400" />
              </button>
            );
          })}

          {installMode === 'prompt' && (
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                install();
              }}
              className="w-full px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2.5 bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-200"
            >
              <Download className="w-4 h-4" />
              <span>ثبّت التطبيق على هاتفك</span>
            </button>
          )}

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 px-2">
            <button 
              onClick={() => handleNavClick('privacy')}
              className="hover:text-indigo-300"
            >
              الخصوصية
            </button>
            <span className="text-slate-700">•</span>
            <button 
              onClick={() => handleNavClick('terms')}
              className="hover:text-indigo-300"
            >
              شروط الاستخدام
            </button>
            <span className="text-slate-700">•</span>
            <button 
              onClick={() => handleNavClick('contact')}
              className="hover:text-indigo-300"
            >
              الدعم الفني
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
