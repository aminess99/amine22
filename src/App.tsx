import { lazy, Suspense, useState } from 'react';
import { HomePage } from './components/HomePage';
import { Navbar, PageTab } from './components/Navbar';
import { Footer } from './components/Footer';
import { AuthProvider } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import type { SavedProject } from './lib/firebaseProjects';
import { TemplateType } from './types';

// The editor and the secondary pages load on demand, so the home page opens fast.
const CaptionEditor = lazy(() => import('./components/CaptionEditor').then((m) => ({ default: m.CaptionEditor })));
const SavedProjectsModal = lazy(() => import('./components/SavedProjectsModal').then((m) => ({ default: m.SavedProjectsModal })));
const VideoEditor = lazy(() => import('./components/editor/VideoEditor').then((m) => ({ default: m.VideoEditor })));
const TemplatesPage = lazy(() => import('./components/pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })));
const HelpCenterPage = lazy(() => import('./components/pages/HelpCenterPage').then((m) => ({ default: m.HelpCenterPage })));
const PrivacyPolicyPage = lazy(() => import('./components/pages/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage })));
const TermsPage = lazy(() => import('./components/pages/TermsPage').then((m) => ({ default: m.TermsPage })));
const ContactPage = lazy(() => import('./components/pages/ContactPage').then((m) => ({ default: m.ContactPage })));
const PricingPage = lazy(() => import('./components/pages/PricingPage').then((m) => ({ default: m.PricingPage })));

function Loading() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center bg-slate-950">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-700 border-t-fuchsia-500" />
    </div>
  );
}

function MainApp() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState<PageTab>('home');
  const [initialFiles, setInitialFiles] = useState<File[] | undefined>();
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('hormozi');
  const [isSavedProjectsOpen, setIsSavedProjectsOpen] = useState<boolean>(false);
  const [loadedProject, setLoadedProject] = useState<SavedProject | null>(null);

  // If a video is loaded into the editor, render the caption editor view
  if (videoFile) {
    return (
      <Suspense fallback={<Loading />}>
      <CaptionEditor 
        videoFile={videoFile} 
        onBack={() => {
          setVideoFile(null);
          setLoadedProject(null);
        }} 
        initialTemplate={selectedTemplate}
        initialProject={loadedProject}
      />
      </Suspense>
    );
  }

  if (currentPage === 'editor') {
    return (
      <Suspense fallback={<Loading />}>
      <VideoEditor
        initialFiles={initialFiles}
        onBack={() => {
          setInitialFiles(undefined);
          setCurrentPage('home');
        }}
      />
      </Suspense>
    );
  }

  // Handle template selection from the templates showcase page
  const handleSelectTemplateToTry = (templateId: TemplateType) => {
    setSelectedTemplate(templateId);
    setCurrentPage('editor');
  };

  const handleNavigate = (page: PageTab) => {
    if (page === 'features') {
      // Features live on the home page.
      setCurrentPage('home');
      setTimeout(() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }), 50);
      return;
    }
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectProject = (project: SavedProject) => {
    setLoadedProject(project);
    // Create a lightweight simulated File placeholder for the project session
    const dummyBlob = new Blob([], { type: 'video/mp4' });
    const dummyFile = new File([dummyBlob], project.videoName, { type: 'video/mp4' });
    setVideoFile(dummyFile);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30 flex flex-col justify-between relative overflow-x-hidden">
      
      {/* Decorative ambient background glows */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/30 via-slate-950 to-slate-950 pointer-events-none -z-10" />
      <div className="fixed -top-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed -bottom-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Global Navigation Header */}
      <Navbar 
        currentPage={currentPage} 
        onNavigate={handleNavigate} 
        onOpenSavedProjects={() => setIsSavedProjectsOpen(true)}
      />
      
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center relative w-full">
        <Suspense fallback={<Loading />}>
        {currentPage === 'home' && (
          <HomePage
            onStart={() => handleNavigate('editor')}
            onStartWithFiles={(files) => {
              setInitialFiles(files);
              handleNavigate('editor');
            }}
          />
        )}

        {currentPage === 'templates' && (
          <TemplatesPage 
            onSelectTemplateToTry={handleSelectTemplateToTry}
            onGoToStudio={() => handleNavigate('editor')}
          />
        )}


        {currentPage === 'pricing' && (
          <PricingPage 
            onGoToStudio={() => handleNavigate('editor')}
            onGoToContact={() => handleNavigate('contact')}
          />
        )}

        {currentPage === 'help' && (
          <HelpCenterPage 
            onGoToContact={() => handleNavigate('contact')}
            onGoToStudio={() => handleNavigate('editor')}
          />
        )}

        {currentPage === 'privacy' && (
          <PrivacyPolicyPage 
            onGoToContact={() => handleNavigate('contact')}
          />
        )}

        {currentPage === 'terms' && (
          <TermsPage 
            onGoToStudio={() => handleNavigate('editor')}
          />
        )}

        {currentPage === 'contact' && (
          <ContactPage 
            onGoToHelp={() => handleNavigate('help')}
          />
        )}
        </Suspense>
      </main>

      {/* Global Comprehensive Footer */}
      <Footer onNavigate={handleNavigate} />

      {/* Authentication Modal */}
      <AuthModal />

      {/* Saved Projects Modal */}
      {isSavedProjectsOpen && (
        <Suspense fallback={null}>
          <SavedProjectsModal
            isOpen={isSavedProjectsOpen}
            onClose={() => setIsSavedProjectsOpen(false)}
            onSelectProject={handleSelectProject}
          />
        </Suspense>
      )}

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
