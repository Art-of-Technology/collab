export interface BoardImportData {
  board: {
    name: string;
    description?: string;
    issuePrefix?: string;
  };
  columns?: {
    name: string;
    order: number;
    color?: string;
    description?: string;
  }[];
  milestones: {
    title: string;
    description?: string;
    status?: string;
    startDate?: string;
    dueDate?: string;
    color?: string;
    columnName?: string; // İsteğe bağlı - hangi kolonda yer alacağı
    position?: number;
    assigneeEmail?: string; // Email ile atama
    labels?: string[];
    epics: {
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      startDate?: string;
      dueDate?: string;
      color?: string;
      columnName?: string;
      position?: number;
      assigneeEmail?: string;
      labels?: string[];
      stories: {
        title: string;
        description?: string;
        status?: string;
        priority?: string;
        type?: string;
        storyPoints?: number;
        color?: string;
        columnName?: string;
        position?: number;
        assigneeEmail?: string;
        labels?: string[];
        tasks: {
          title: string;
          description?: string;
          status?: string;
          priority?: string;
          type?: string;
          storyPoints?: number;
          dueDate?: string;
          columnName?: string;
          position?: number;
          assigneeEmail?: string;
          labels?: string[];
        }[];
      }[];
    }[];
  }[];
}

export interface ImportProgress {
  stage: 'validating' | 'creating-board' | 'creating-columns' | 'creating-milestones' | 'creating-epics' | 'creating-stories' | 'creating-tasks' | 'completed' | 'error';
  progress: number;
  message: string;
  details?: any;
}

export interface ImportResult {
  success: boolean;
  boardId?: string;
  errors?: string[];
  warnings?: string[];
  created: {
    board?: any;
    columns: number;
    milestones: number;
    epics: number;
    stories: number;
    tasks: number;
  };
}

// Örnek JSON yapısı dökümantasyonu için
export const SAMPLE_IMPORT_JSON: BoardImportData = {
  board: {
    name: "Proje X Development",
    description: "Ana geliştirme projesi",
    issuePrefix: "PRX"
  },
  columns: [
    { name: "Backlog", order: 0, color: "#64748B" },
    { name: "To Do", order: 1, color: "#6366F1" },
    { name: "In Progress", order: 2, color: "#EC4899" },
    { name: "Review", order: 3, color: "#F59E0B" },
    { name: "Done", order: 4, color: "#10B981" }
  ],
  milestones: [
    {
      title: "Version 1.0 Release",
      description: "İlk stabil sürüm çıkarımı",
      status: "planned",
      startDate: "2024-01-01",
      dueDate: "2024-03-31",
      color: "#6366F1",
      columnName: "To Do",
      position: 0,
      assigneeEmail: "lead@example.com",
      labels: ["milestone", "v1.0"],
      epics: [
        {
          title: "User Authentication System",
          description: "Kullanıcı giriş ve yetkilendirme sistemi",
          status: "backlog",
          priority: "high",
          startDate: "2024-01-01",
          dueDate: "2024-01-31",
          color: "#8B5CF6",
          columnName: "To Do",
          position: 0,
          assigneeEmail: "dev1@example.com",
          labels: ["auth", "security"],
          stories: [
            {
              title: "User Login",
              description: "Kullanıcıların sisteme giriş yapabilmesi",
              status: "backlog",
              priority: "high",
              type: "user-story",
              storyPoints: 8,
              color: "#3B82F6",
              columnName: "To Do",
              position: 0,
              assigneeEmail: "dev1@example.com",
              labels: ["auth", "frontend"],
              tasks: [
                {
                  title: "Login API endpoint oluştur",
                  description: "POST /api/auth/login endpoint'i",
                  status: "todo",
                  priority: "high",
                  type: "task",
                  storyPoints: 3,
                  dueDate: "2024-01-15",
                  columnName: "To Do",
                  position: 0,
                  assigneeEmail: "backend-dev@example.com",
                  labels: ["auth", "backend", "api"]
                },
                {
                  title: "Login form komponenti",
                  description: "React login form komponenti oluştur",
                  status: "todo",
                  priority: "high",
                  type: "task",
                  storyPoints: 2,
                  dueDate: "2024-01-18",
                  columnName: "To Do",
                  position: 1,
                  assigneeEmail: "frontend-dev@example.com",
                  labels: ["auth", "frontend", "react"]
                }
              ]
            },
            {
              title: "User Registration",
              description: "Yeni kullanıcıların kayıt olabilmesi",
              status: "backlog",
              priority: "medium",
              type: "user-story",
              storyPoints: 5,
              color: "#3B82F6",
              columnName: "To Do",
              position: 1,
              assigneeEmail: "dev1@example.com",
              labels: ["auth", "registration"],
              tasks: [
                {
                  title: "Registration API endpoint",
                  description: "POST /api/auth/register endpoint'i",
                  status: "todo",
                  priority: "medium",
                  type: "task",
                  storyPoints: 3,
                  dueDate: "2024-01-20",
                  columnName: "To Do",
                  position: 0,
                  assigneeEmail: "backend-dev@example.com",
                  labels: ["auth", "backend", "api"]
                }
              ]
            }
          ]
        },
        {
          title: "Dashboard Implementation",
          description: "Ana dashboard ekranı ve widget'ları",
          status: "backlog",
          priority: "medium",
          color: "#F59E0B",
          columnName: "To Do",
          position: 1,
          assigneeEmail: "dev2@example.com",
          labels: ["dashboard", "ui"],
          stories: [
            {
              title: "Main Dashboard Layout",
              description: "Ana dashboard düzeni ve navigasyon",
              status: "backlog",
              priority: "medium",
              type: "user-story",
              storyPoints: 13,
              color: "#3B82F6",
              columnName: "To Do",
              position: 0,
              assigneeEmail: "frontend-dev@example.com",
              labels: ["dashboard", "layout"],
              tasks: [
                {
                  title: "Header component",
                  description: "Dashboard header komponenti",
                  status: "todo",
                  priority: "medium",
                  type: "task",
                  storyPoints: 2,
                  columnName: "To Do",
                  position: 0,
                  assigneeEmail: "frontend-dev@example.com",
                  labels: ["dashboard", "components"]
                },
                {
                  title: "Sidebar navigation",
                  description: "Sol sidebar navigasyon menüsü",
                  status: "todo",
                  priority: "medium",
                  type: "task",
                  storyPoints: 3,
                  columnName: "To Do",
                  position: 1,
                  assigneeEmail: "frontend-dev@example.com",
                  labels: ["dashboard", "navigation"]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}; 