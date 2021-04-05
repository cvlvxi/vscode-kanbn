declare type KanbnTask = {
  uuid?: string,
  id: string,
  name: string,
  description: string,
  column: string,
  workload?: number,
  remainingWorkload?: number,
  progress?: number,
  metadata: {
    created: string,
    updated?: string,
    started?: string,
    due?: string,
    completed?: string,
    assigned?: string,
    tags?: string[]
  },
  relations: Array<{
    type: string,
    task: string
  }>,
  subTasks: Array<{
    text: string,
    completed: boolean
  }>,
  comments: Array<{
    author: string,
    date: string,
    text: string
  }>
};
