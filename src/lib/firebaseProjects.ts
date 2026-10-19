import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  orderBy, 
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { db } from './firestore';
import { CaptionSegment, EditorSettings } from '../types';

export interface SavedProject {
  id: string;
  userId: string;
  videoName: string;
  template: string;
  captionCount: number;
  duration: number;
  updatedAt: string;
  segments: CaptionSegment[];
  settings: EditorSettings;
}

/**
 * Save or update a project under /users/{userId}/projects/{projectId}
 */
export async function saveProjectToFirestore(
  userId: string, 
  project: {
    id?: string;
    videoName: string;
    template: string;
    captionCount: number;
    duration: number;
    segments: CaptionSegment[];
    settings: EditorSettings;
  }
): Promise<string> {
  const projectId = project.id || `proj_${Date.now()}`;
  const projectRef = doc(db, 'users', userId, 'projects', projectId);

  const payload = {
    userId,
    videoName: project.videoName,
    template: project.template,
    captionCount: project.captionCount,
    duration: project.duration,
    updatedAt: new Date().toISOString(),
    segments: project.segments,
    settings: project.settings
  };

  await setDoc(projectRef, payload, { merge: true });
  return projectId;
}

/**
 * Get all saved projects for a user
 */
export async function getUserProjects(userId: string): Promise<SavedProject[]> {
  try {
    const projectsCol = collection(db, 'users', userId, 'projects');
    const q = query(projectsCol, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as Omit<SavedProject, 'id'>)
    }));
  } catch (err) {
    console.error('Error fetching user projects:', err);
    return [];
  }
}

/**
 * Delete a saved project
 */
export async function deleteUserProject(userId: string, projectId: string): Promise<void> {
  const projectRef = doc(db, 'users', userId, 'projects', projectId);
  await deleteDoc(projectRef);
}
