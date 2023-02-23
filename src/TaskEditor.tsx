/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React, { useEffect, useState, useCallback } from 'react'
import { Formik, Form, Field, ErrorMessage, FieldArray } from 'formik'
import formatDate from 'dateformat'
import vscode from './vscode'
import { paramCase } from '@basementuniverse/kanbn/src/utility'
import ReactMarkdown from 'react-markdown'
import TextareaAutosize from 'react-textarea-autosize'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import 'katex/dist/katex.min.css'

interface KanbnTaskValidationOutput {
  name: string
  metadata: {
    tags: string[]
    created?: string | Date | undefined
    updated?: string | null | undefined
    started?: string
    due?: string
    completed?: string
    assigned?: string | undefined
  }
  subTasks: Array<{
    text: string
  }>
  comments: Array<{
    author?: string
    date?: string
    text: string
  }>
}

interface KanbnTaskValidationInput extends KanbnTaskValidationOutput {
  description: any
  relations: any
  progress: number | undefined
  id: string
  column: string
}

const components = {
  code ({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? '')
    return inline !== false && (match != null)
      ? (
      <SyntaxHighlighter
        style={{}}
        useInlineStyles={false}
        language={match[1]}
        PreTag="div"
        {...props}>
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
        )
      : (
      <code className={className} {...props}>
        {children}
      </code>
        )
  }
}

const Markdown = (props): JSX.Element => (<ReactMarkdown {...{
  remarkPlugins: [remarkMath],
  rehypePlugins: [rehypeKatex],
  components,
  ...props
}} />)

const TaskEditor = (): JSX.Element => {
  const [state, setState] = useState(vscode.getState() ?? {
    type: '',
    name: '',
    customFields: [],
    dateFormat: '',
    task: null,
    tasks: {},
    columnName: '',
    columnNames: [] as string[],
    sprints: [],
    taskData: {
      id: '',
      name: '',
      description: '',
      column: '',
      progress: 0,
      metadata: {
        created: new Date(),
        updated: null,
        started: '',
        due: '',
        completed: '',
        assigned: '',
        tags: []
      },
      relations: [],
      subTasks: [],
      comments: []
    },
    editingDescription: false,
    editingComment: -1
  })

  const processMessage = useCallback(event => {
    const newState: any = {}
    const tasks = Object.fromEntries((event.data.tasks ?? []).map(task => [task.id, task]))
    newState.task = event.data.task
    newState.tasks = tasks
    newState.columnName = event.data.columnName
    newState.columnNames = Object.keys(event.data.index.columns)
    newState.customFields = event.data.customFields
    newState.type = event.data.type
    newState.dateFormat = event.data.dateFormat
    newState.editingDescription = state.editingDescription
    newState.editingComment = state.editingComment
    const task = newState.task
    newState.taskData = {
      id: task?.id ?? '',
      name: task?.name ?? '',
      description: task?.description ?? '',
      column: newState.columnName,
      progress: task?.progress ?? 0,
      metadata: {
        created: task?.metadata?.created ?? new Date(),
        updated: task?.metadata?.updated ?? null,
        started: task?.metadata?.started !== undefined ? formatDate(task.metadata.started, 'yyyy-mm-dd') : '',
        due: task?.metadata?.due !== undefined ? formatDate(task.metadata.due, 'yyyy-mm-dd') : '',
        completed: task?.metadata?.completed !== undefined ? formatDate(task.metadata.completed, 'yyyy-mm-dd') : '',
        assigned: task?.metadata?.assigned ?? '',
        tags: task?.metadata?.tags ?? [],
        ...Object.fromEntries(
          newState.customFields.map(customField => [
            customField.name,
            ((task != null) && customField.name in task.metadata)
              ? (customField.type === 'date'
                  ? formatDate(task.metadata[customField.name], 'yyyy-mm-dd')
                  : task.metadata[customField.name]
                )
              : null
          ])
        )
      },
      relations: task?.relations ?? [],
      subTasks: task?.subTasks ?? [],
      comments: task?.comments ?? []
    }
    vscode.setState(newState)
    setState(newState)
  }, [])

  useEffect(() => {
    window.addEventListener('message', processMessage)
    return () => {
      window.removeEventListener('message', processMessage)
    }
  }, [])

  const setTaskData = (taskData): void => {
    const newState = { ...state, taskData }
    setState(newState)
    vscode.setState(newState)
  }
  const editing = state.task !== null
  const setEditingDescription = (editingDescription): void => {
    const newState = { ...state, editingDescription }
    setState(newState)
    vscode.setState(newState)
  }
  const setEditingComment = (editingComment): void => {
    const newState = { ...state, editingComment }
    setState(newState)
    vscode.setState(newState)
  }

  // Called when the name field is changed
  const handleUpdateName = ({ target: { value } }, values): void => {
    const id = paramCase(value)

    // Update the id preview
    setTaskData({
      ...state.taskData,
      id,
      name: value
    })

    // Update values
    values.id = id
  }

  // Called when the form is submitted
  const handleSubmit = (values, setSubmitting, resetForm): void => {
    if (editing) {
      vscode.postMessage({
        command: 'kanbn.update',
        taskId: state.task?.id,
        taskData: values,
        customFields: state.customFields
      })
    } else {
      vscode.postMessage({
        command: 'kanbn.create',
        taskData: values,
        customFields: state.customFields
      })
    }
    setTaskData(values)
    resetForm({ values })
    setSubmitting(false)
  }

  // Called when the delete task button is clicked
  const handleRemoveTask = (values): void => {
    vscode.postMessage({
      command: 'kanbn.delete',
      taskId: state.task?.id,
      taskData: values
    })
  }

  // Called when the archive task button is clicked
  const handleArchiveTask = (values): void => {
    vscode.postMessage({
      command: 'kanbn.archive',
      taskId: state.task?.id,
      taskData: values
    })
  }

  // Check if a task's due date is in the past
  const checkOverdue = (values: { metadata: { due?: string } }): boolean => {
    if ('due' in values.metadata && values.metadata.due !== undefined) {
      return Date.parse(values.metadata.due) < (new Date()).getTime()
    }
    return false
  }

  // Validate form data
  const validate = (values: KanbnTaskValidationInput): KanbnTaskValidationOutput | {} => {
    let hasErrors = false
    const errors: KanbnTaskValidationOutput = {
      name: '',
      metadata: {
        tags: []
      },
      subTasks: [],
      comments: []
    }

    // Task name cannot be empty
    if (values.id === '') {
      errors.name = 'Task name is required.'
      hasErrors = true
    }

    // Check if the id is already in use
    if (state.taskData.id in state.tasks && state.tasks[state.taskData.id].uuid !== ((state.task != null) ? state.task.uuid : '')) {
      errors.name = 'There is already a task with the same name or id.'
      hasErrors = true
    }

    // Tag names cannot be empty
    for (let i = 0; i < values.metadata.tags.length; i++) {
      if (values.metadata.tags[i] === '') {
        errors.metadata.tags[i] = 'Tag cannot be empty.'
        hasErrors = true
      }
    }

    // Sub-tasks text cannot be empty
    for (let i = 0; i < values.subTasks.length; i++) {
      if (values.subTasks[i].text === '') {
        errors.subTasks[i] = {
          text: 'Sub-task text cannot be empty.'
        }
        hasErrors = true
      }
    }

    // Comments text cannot be empty
    for (let i = 0; i < values.comments.length; i++) {
      if (values.comments[i].text === '') {
        errors.comments[i] = {
          text: 'Comment text cannot be empty.'
        }
        hasErrors = true
      }
    }

    return hasErrors ? errors : {}
  }

  useEffect(() => {
    vscode.postMessage({
      command: 'kanbn.updateMe'
    })
  }, [])

  return (
    <div className="kanbn-task-editor">
      <Formik
        initialValues={state.taskData}
        validate={validate}
        enableReinitialize
        onSubmit={(values, { setSubmitting, resetForm }) => {
          handleSubmit(values, setSubmitting, resetForm)
        }}
      >
        {({
          dirty,
          values,
          handleChange,
          isSubmitting
        }) => (
          <Form>
            <h1 className="kanbn-task-editor-title">
              {editing ? 'Update task' : 'Create new task'}
              {dirty && <span className="kanbn-task-editor-dirty">*</span>}
            </h1>
            <div className="kanbn-task-editor-buttons kanbn-task-editor-main-buttons">
              {editing && <button
                type="button"
                className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                title="Delete task"
                onClick={() => {
                  handleRemoveTask(values)
                }}
              >
                <i className="codicon codicon-trash"></i>Delete
              </button>}
              {editing && <button
                type="button"
                className="kanbn-task-editor-button kanbn-task-editor-button-archive"
                title="Archive task"
                onClick={() => {
                  handleArchiveTask(values)
                }}
              >
                <i className="codicon codicon-archive"></i>Archive
              </button>}
              <button
                type="submit"
                className="kanbn-task-editor-button kanbn-task-editor-button-submit"
                title="Save task"
                disabled={isSubmitting}
              >
                <i className="codicon codicon-save"></i>Save
              </button>
            </div>
            {editing && <span className="kanbn-task-editor-dates">
              {
                [
                  'created' in state.task.metadata ? `Created ${formatDate(state.task.metadata.created, state.dateFormat)}` : null,
                  'updated' in state.task.metadata ? `Updated ${formatDate(state.task.metadata.updated, state.dateFormat)}` : null
                ].filter(i => i).join(', ')
              }
            </span>}
            <div className="kanbn-task-editor-form">
              <div className="kanbn-task-editor-column-left">
                <div className="kanbn-task-editor-field kanbn-task-editor-field-name">
                  <label className="kanbn-task-editor-field-label">
                    <p>Name</p>
                    <Field
                      className="kanbn-task-editor-field-input"
                      name="name"
                      placeholder="Name"
                      onChange={e => {
                        handleChange(e)
                        handleUpdateName(e, values)
                      }}
                    />
                  </label>
                  <div className="kanbn-task-editor-id">{state.taskData?.id ?? ''}</div>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="name"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-description">
                  <label
                    className="kanbn-task-editor-field-label kanbn-task-editor-field-label-description"
                    htmlFor="description-input"
                  >
                    <p>Description</p>
                  </label>
                  <button
                    type="button"
                    className="kanbn-task-editor-button kanbn-task-editor-button-edit-description"
                    title="Edit description"
                    onClick={() => {
                      setEditingDescription(!state.editingDescription)
                    }}
                  >
                    {
                      state.editingDescription === true
                        ? <><i className="codicon codicon-preview"></i> Preview</>
                        : <><i className="codicon codicon-edit"></i> Edit</>
                    }
                  </button>
                  {
                    state.editingDescription
                      ? <Field
                        className="kanbn-task-editor-field-textarea"
                        id="description-input"
                        as={TextareaAutosize}
                        name="description"
                      />
                      : <Markdown className="kanbn-task-editor-description-preview">
                        {values.description}
                      </Markdown>
                  }
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="description"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-subtasks">
                  <h2 className="kanbn-task-editor-title">Sub-tasks</h2>
                  <FieldArray name="subTasks">
                    {({ insert, remove, push }) => (
                      <div>
                        {values.subTasks.length > 0 && values.subTasks.map((subTask, index) => (
                          <div className="kanbn-task-editor-row kanbn-task-editor-row-subtask" key={index}>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-subtask-completed">
                              <Field
                                className="kanbn-task-editor-field-checkbox"
                                type="checkbox"
                                name={`subTasks.${index}.completed`}
                              />
                              <ErrorMessage
                                className="kanbn-task-editor-field-errors"
                                component="div"
                                name={`subTasks.${index}.completed`}
                              />
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-subtask-text">
                              <Field
                                className="kanbn-task-editor-field-input"
                                name={`subTasks.${index}.text`}
                                placeholder="Sub-task text"
                              />
                              <ErrorMessage
                                className="kanbn-task-editor-field-errors"
                                component="div"
                                name={`subTasks.${index}.text`}
                              />
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-column-buttons">
                              <button
                                type="button"
                                className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                                title="Remove sub-task"
                                onClick={() => remove(index)}
                              >
                                <i className="codicon codicon-trash"></i>
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="kanbn-task-editor-buttons">
                          <button
                            type="button"
                            className="kanbn-task-editor-button kanbn-task-editor-button-add"
                            title="Add sub-task"
                            onClick={() => push({ completed: false, text: '' })}
                          >
                            <i className="codicon codicon-tasklist"></i>Add sub-task
                          </button>
                        </div>
                      </div>
                    )}
                  </FieldArray>
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-relations">
                  <h2 className="kanbn-task-editor-title">Relations</h2>
                  <FieldArray name="relations">
                    {({ insert, remove, push }) => (
                      <div>
                        {values.relations.length > 0 && values.relations.map((relation, index) => (
                          <div className="kanbn-task-editor-row kanbn-task-editor-row-relation" key={index}>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-relation-type">
                              <Field
                                className="kanbn-task-editor-field-input"
                                name={`relations.${index}.type`}
                                placeholder="Relation type"
                              />
                              <ErrorMessage
                                className="kanbn-task-editor-field-errors"
                                component="div"
                                name={`relations.${index}.type`}
                              />
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-relation-task">
                              <Field
                                className="kanbn-task-editor-field-select"
                                as="select"
                                name={`relations.${index}.task`}
                              >
                                {Object.keys(state.tasks).map(t => <option key={state.tasks[t].id} value={t}>{t}</option>)}
                              </Field>
                              <ErrorMessage
                                className="kanbn-task-editor-field-errors"
                                component="div"
                                name={`relations.${index}.task`}
                              />
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-column-buttons">
                              <button
                                type="button"
                                className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                                title="Remove relation"
                                onClick={() => remove(index)}
                              >
                                <i className="codicon codicon-trash"></i>
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="kanbn-task-editor-buttons">
                          <button
                            type="button"
                            className="kanbn-task-editor-button kanbn-task-editor-button-add"
                            title="Add relation"
                            onClick={() => push({ type: '', task: '' })}
                          >
                            <i className="codicon codicon-link"></i>Add relation
                          </button>
                        </div>
                      </div>
                    )}
                  </FieldArray>
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-comments">
                  <h2 className="kanbn-task-editor-title">Comments</h2>
                  <FieldArray name="comments">
                    {({ insert, remove, push }) => (
                      <div>
                        {values.comments.length > 0 && values.comments.map((comment, index) => (
                          <div className="kanbn-task-editor-row-comment" key={index}>
                            <div className="kanbn-task-editor-row">
                              <div className="kanbn-task-editor-column kanbn-task-editor-field-comment-author">
                                {
                                  state.editingComment === index
                                    ? <>
                                      <Field
                                        className="kanbn-task-editor-field-input"
                                        name={`comments.${index}.author`}
                                        placeholder="Comment author"
                                      />
                                      <ErrorMessage
                                        className="kanbn-task-editor-field-errors"
                                        component="div"
                                        name={`comments.${index}.author`}
                                      />
                                    </>
                                    : <div className="kanbn-task-editor-field-comment-author-value">
                                      <i className="codicon codicon-account"></i>
                                      {comment.author ?? 'Anonymous'}
                                    </div>
                                }
                              </div>
                              <div className="kanbn-task-editor-column kanbn-task-editor-field-comment-date">
                                {formatDate(comment.date, state.dateFormat)}
                              </div>
                              <div className="kanbn-task-editor-column kanbn-task-editor-column-buttons">
                                <button
                                  type="button"
                                  className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                                  title="Remove comment"
                                  onClick={() => remove(index)}
                                >
                                  <i className="codicon codicon-trash"></i>
                                </button>
                                <button
                                  type="button"
                                  className="kanbn-task-editor-button kanbn-task-editor-button-edit"
                                  title={state.editingComment === index ? 'View comment' : 'Edit comment'}
                                  onClick={() => {
                                    setEditingComment(state.editingComment !== index ? index : -1)
                                  }}
                                >
                                  {
                                    state.editingComment === index
                                      ? <i className="codicon codicon-preview"></i>
                                      : <i className="codicon codicon-edit"></i>
                                  }
                                </button>
                              </div>
                            </div>
                            <div className="kanbn-task-editor-row">
                              <div className="kanbn-task-editor-column kanbn-task-editor-field-comment-text">
                                {
                                  state.editingComment === index
                                    ? <>
                                      <Field
                                        className="kanbn-task-editor-field-textarea"
                                        as={TextareaAutosize}
                                        name={`comments.${index}.text`}
                                      />
                                      <ErrorMessage
                                        className="kanbn-task-editor-field-errors"
                                        component="div"
                                        name={`comments.${index}.text`}
                                      />
                                    </>
                                    : <Markdown className="kanbn-task-editor-comment-text">
                                      {comment.text}
                                    </Markdown>
                                }
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="kanbn-task-editor-buttons">
                          <button
                            type="button"
                            className="kanbn-task-editor-button kanbn-task-editor-button-add"
                            title="Add comment"
                            onClick={() => {
                              push({ text: '', date: new Date(), author: '' })
                              setEditingComment(values.comments.length)
                            }}
                          >
                            <i className="codicon codicon-comment"></i>Add comment
                          </button>
                        </div>
                      </div>
                    )}
                  </FieldArray>
                </div>
              </div>
              <div className="kanbn-task-editor-column-right">
                <div className="kanbn-task-editor-field kanbn-task-editor-field-column">
                  <label className="kanbn-task-editor-field-label">
                    <p>Column</p>
                    <Field
                      className="kanbn-task-editor-field-select"
                      as="select"
                      name="column"
                    >
                      {state.columnNames.map(c => <option key={c} value={c}>{c}</option>)}
                    </Field>
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="column"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-assigned">
                  <label className="kanbn-task-editor-field-label">
                    <p>Assigned to</p>
                    <Field
                      className="kanbn-task-editor-field-input"
                      name="metadata.assigned"
                      placeholder="Assigned to"
                    />
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="metadata.assigned"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-started">
                  <label className="kanbn-task-editor-field-label">
                    <p>Started date</p>
                    <Field
                      className="kanbn-task-editor-field-input"
                      type="date"
                      name="metadata.started"
                    />
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="metadata.started"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-due">
                  <label className="kanbn-task-editor-field-label">
                    <p>Due date</p>
                    <Field
                      className={[
                        'kanbn-task-editor-field-input',
                        checkOverdue(values) ? 'kanbn-task-overdue' : null
                      ].filter(i => i).join(' ')}
                      type="date"
                      name="metadata.due"
                    />
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="metadata.due"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-completed">
                  <label className="kanbn-task-editor-field-label">
                    <p>Completed date</p>
                    <Field
                      className="kanbn-task-editor-field-input"
                      type="date"
                      name="metadata.completed"
                    />
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="metadata.completed"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-progress">
                  <label className="kanbn-task-editor-field-label">
                    <p>Progress</p>
                    <Field
                      className="kanbn-task-editor-field-input"
                      type="number"
                      name="progress"
                      min="0"
                      max="1"
                      step="0.05"
                    />
                    <div className="kanbn-task-progress" style={{
                      width: `${Math.min(1, Math.max(0, values.progress ?? 0)) * 100}%`
                    }}></div>
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="progress"
                  />
                </div>
                {
                  state.customFields.map(customField => (
                    <div key={customField.name} className={[
                      'kanbn-task-editor-field kanbn-task-editor-custom-field',
                      // TODO: remove the explicit String cast once typescript bindings for kanbn are updated
                      `kanbn-task-editor-custom-field-${String(paramCase(customField.name))}`
                    ].join(' ')}>
                      <label className="kanbn-task-editor-field-label">
                        {customField.type === 'boolean'
                          ? (
                            <>
                              <Field
                                className="kanbn-task-editor-field-input kanbn-task-editor-custom-checkbox"
                                type="checkbox"
                                name={`metadata.${customField.name}`}
                              /><p>{customField.name}</p>
                            </>
                            )
                          : (
                            <>
                              <p>{customField.name}</p>
                              <Field
                                className="kanbn-task-editor-field-input"
                                type={{
                                  date: 'date',
                                  number: 'number',
                                  string: 'text'
                                }[customField.type]}
                                name={`metadata.${customField.name}`}
                              />
                            </>
                            )}
                      </label>
                      <ErrorMessage
                        className="kanbn-task-editor-field-errors"
                        component="div"
                        name={`metadata.${customField.name}`}
                      />
                    </div>
                  ))
                }
                <div className="kanbn-task-editor-field kanbn-task-editor-field-tags">
                  <label className="kanbn-task-editor-field-label">
                    <p>Tags</p>
                  </label>
                  <FieldArray name="metadata.tags">
                    {({ insert, remove, push }) => (
                      <div>
                        {(
                          'tags' in values.metadata &&
                          values.metadata.tags.length > 0
                        ) && values.metadata.tags.map((tag, index) => (
                          <div className="kanbn-task-editor-row kanbn-task-editor-row-tag" key={index}>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-tag">
                              <Field
                                className="kanbn-task-editor-field-input"
                                name={`metadata.tags.${index}`}
                                placeholder="Tag name"
                              />
                              <div
                                className={[
                                  'kanbn-task-editor-tag-highlight',
                                  // TODO: remove the explicit String cast once typescript bindings for kanbn are updated
                                  `kanbn-task-tag-${String(paramCase(values.metadata.tags[index]))}`
                                ].join(' ')}
                              ></div>
                              <ErrorMessage
                                className="kanbn-task-editor-field-errors"
                                component="div"
                                name={`metadata.tags.${index}`}
                              />
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-column-buttons">
                              <button
                                type="button"
                                className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                                title="Remove tag"
                                onClick={() => remove(index)}
                              >
                                <i className="codicon codicon-trash"></i>
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="kanbn-task-editor-buttons">
                          <button
                            type="button"
                            className="kanbn-task-editor-button kanbn-task-editor-button-add"
                            title="Add tag"
                            onClick={() => push('')}
                          >
                            <i className="codicon codicon-tag"></i>Add tag
                          </button>
                        </div>
                      </div>
                    )}
                  </FieldArray>
                </div>
              </div>
            </div>
          </Form>
        )}
      </Formik>
    </div>
  )
}

export default TaskEditor
