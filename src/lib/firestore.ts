import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { app } from './firebase';

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);

/**
 * Sync user profile to Firestore whenever they sign in
 */
export async function syncUserProfile(user: User) {
  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName || 'مستخدم جديد',
        email: user.email || '',
        photoURL: user.photoURL || '',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      });
    } else {
      await setDoc(userRef, {
        lastLoginAt: new Date().toISOString(),
        displayName: user.displayName || snap.data()?.displayName || 'مستخدم',
        photoURL: user.photoURL || snap.data()?.photoURL || ''
      }, { merge: true });
    }
  } catch (err) {
    console.error('Error syncing user profile:', err);
  }
}

