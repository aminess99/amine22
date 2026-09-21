import React, { useEffect, useState } from 'react';
import { 
  X, 
  FolderOpen, 
  Clock, 
  Layers, 
  Trash2, 
  Sparkles, 
  AlertCircle,
  FileVideo,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getUserProjects, deleteUserProject, SavedProject } from '../lib/firebaseProjects';

interface SavedProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (project: SavedProject) => void;
}

export function SavedProjectsModal({ isOpen, onClose, onSelectProject }: SavedProjectsModalProps) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      loadProjects();
    }
  }, [isOpen, user]);

  const loadProjects = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const projs = await getUserProjects(user.uid);
      setProjects(projs);
    } catch (err: any) {
      console.error(err);
      setError('تعذر تحميل المشاريع المحفوظة.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      setDeletingId(projectId);
      await deleteUserProject(user.uid, projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative space-y-6 max-h-[85vh] flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">مشاريعي المحفوظة سحابياً</h3>
              <p className="text-xs text-slate-400">
                استعرض مشاريع الفيديو والنصوص المحفوظة على حسابك في Firebase
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <span className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-semibold">جاري جلب مشاريعك من Firestore...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-400 mx-auto">
                <FileVideo className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-white">لا توجد مشاريع محفوظة بعد</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                عند العمل على أي فيديو في الاستوديو، انقر على زر "حفظ المشروع" في الأعلى لحفظ الترجمات والإعدادات هنا.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => {
                    onSelectProject(proj);
                    onClose();
                  }}
                  className="p-4 rounded-2xl bg-slate-850 hover:bg-slate-800 border border-slate-750 hover:border-indigo-500/50 transition-all cursor-pointer group relative flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileVideo className="w-4 h-4 text-indigo-400 shrink-0" />
                        <h4 className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                          {proj.videoName}
                        </h4>
                      </div>
                      <button
                        onClick={(e) => handleDelete(e, proj.id)}
                        disabled={deletingId === proj.id}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                        title="حذف المشروع"
                      >
                        {deletingId === proj.id ? (
                          <span className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin inline-block" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-medium">
                        قالب: {proj.template}
                      </span>
                      <span>{proj.captionCount} جملة</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{new Date(proj.updatedAt).toLocaleDateString('ar-EG', { dateStyle: 'short' })}</span>
                    </div>
                    <span className="text-indigo-400 font-semibold group-hover:underline">
                      فتح المشروع ←
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800 text-left">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
