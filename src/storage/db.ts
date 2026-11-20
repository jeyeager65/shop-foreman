import type { Id, Project, ShopProfile } from '@/model';

const DB_NAME = 'shop-foreman';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const SETTINGS = 'settings';
const SHOP_KEY = 'shopProfile';
const THUMBNAILS_KEY = 'thumbnails';

export interface Store {
  listProjects(): Promise<Project[]>;
  getProject(id: Id): Promise<Project | undefined>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: Id): Promise<void>;
  getShopProfile(): Promise<ShopProfile | undefined>;
  saveShopProfile(shop: ShopProfile): Promise<void>;
  /** A small picture of each project's 3D view, by project id: for the Projects page. Not part of a project or its file. */
  getThumbnails(): Promise<Record<Id, string>>;
  saveThumbnails(thumbnails: Record<Id, string>): Promise<void>;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Plain copy: drops Vue proxies and anything IndexedDB can't clone. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Projects and the shop profile in the browser's IndexedDB. */
export async function openStore(factory: IDBFactory = indexedDB): Promise<Store> {
  const open = factory.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' });
    if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
  };
  const db = await request(open);
  const store = (name: string, mode: IDBTransactionMode) => db.transaction(name, mode).objectStore(name);

  return {
    listProjects: async () => {
      const all = (await request(store(PROJECTS, 'readonly').getAll())) as Project[];
      return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    getProject: (id) => request(store(PROJECTS, 'readonly').get(id)) as Promise<Project | undefined>,
    saveProject: async (project) => {
      await request(store(PROJECTS, 'readwrite').put(plain(project)));
    },
    deleteProject: async (id) => {
      await request(store(PROJECTS, 'readwrite').delete(id));
    },
    getShopProfile: () => request(store(SETTINGS, 'readonly').get(SHOP_KEY)) as Promise<ShopProfile | undefined>,
    saveShopProfile: async (shop) => {
      await request(store(SETTINGS, 'readwrite').put(plain(shop), SHOP_KEY));
    },
    getThumbnails: async () => ((await request(store(SETTINGS, 'readonly').get(THUMBNAILS_KEY))) as Record<Id, string> | undefined) ?? {},
    saveThumbnails: async (thumbnails) => {
      await request(store(SETTINGS, 'readwrite').put(plain(thumbnails), THUMBNAILS_KEY));
    },
  };
}
