import { useState } from 'react';
import { CaptionEditor } from './components/CaptionEditor';
import { VideoUploader } from './components/VideoUploader';
import { Navbar, PageTab } from './components/Navbar';
import { Footer } from './components/Footer';
import { TemplatesPage } from './components/pages/TemplatesPage';
import { FeaturesPage } from './components/pages/FeaturesPage';
import { HelpCenterPage } from './components/pages/HelpCenterPage';
import { PrivacyPolicyPage } from './components/pages/PrivacyPolicyPage';
import { TermsPage } from './components/pages/TermsPage';
import { ContactPage } from './components/pages/ContactPage';
import { PricingPage } from './components/pages/PricingPage';
import { AuthProvider } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import { SavedProjectsModal } from './components/SavedProjectsModal';
import { SavedProject } from './lib/firebaseProjects';
import { TemplateType } from './types';

function MainApp() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState<PageTab>('studio');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('hormozi');
  const [isSavedProjectsOpen, setIsSavedProjectsOpen] = useState<boolean>(false);
  const [loadedProject, setLoadedProject] = useState<SavedProject | null>(null);

  // If a video is loaded into the editor, render the caption editor view
  if (videoFile) {
    return (
      <CaptionEditor 
        videoFile={videoFile} 
        onBack={() => {
          setVideoFile(null);
          setLoadedProject(null);
        }} 
        initialTemplate={selectedTemplate}
        initialProject={loadedProject}
      />
    );
  }

  // Handle template selection from the templates showcase page
  const handleSelectTemplateToTry = (templateId: TemplateType) => {
    setSelectedTemplate(templateId);
    setCurrentPage('studio');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigate = (page: PageTab) => {
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
        {currentPage === 'studio' && (
          <VideoUploader 
            onVideoSelect={setVideoFile} 
            onNavigate={handleNavigate}
          />
        )}

        {currentPage === 'templates' && (
          <TemplatesPage 
            onSelectTemplateToTry={handleSelectTemplateToTry}
            onGoToStudio={() => handleNavigate('studio')}
          />
        )}

        {currentPage === 'features' && (
          <FeaturesPage 
            onGoToStudio={() => handleNavigate('studio')}
          />
        )}

        {currentPage === 'pricing' && (
          <PricingPage 
            onGoToStudio={() => handleNavigate('studio')}
            onGoToContact={() => handleNavigate('contact')}
          />
        )}

        {currentPage === 'help' && (
          <HelpCenterPage 
            onGoToContact={() => handleNavigate('contact')}
            onGoToStudio={() => handleNavigate('studio')}
          />
        )}

        {currentPage === 'privacy' && (
          <PrivacyPolicyPage 
            onGoToContact={() => handleNavigate('contact')}
          />
        )}

        {currentPage === 'terms' && (
          <TermsPage 
            onGoToStudio={() => handleNavigate('studio')}
          />
        )}

        {currentPage === 'contact' && (
          <ContactPage 
            onGoToHelp={() => handleNavigate('help')}
          />
        )}
      </main>

      {/* Global Comprehensive Footer */}
      <Footer onNavigate={handleNavigate} />

      {/* Authentication Modal */}
      <AuthModal />

      {/* Saved Projects Modal */}
      <SavedProjectsModal 
        isOpen={isSavedProjectsOpen}
        onClose={() => setIsSavedProjectsOpen(false)}
        onSelectProject={handleSelectProject}
      />

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
