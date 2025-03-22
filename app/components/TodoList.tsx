import React, { useState } from 'react';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

const TodoList: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, text: 'Learn React', completed: false },
    { id: 2, text: 'Build a Todo App', completed: false },
    { id: 3, text: 'Deploy to production', completed: false },
  ]);
  const [newTodoText, setNewTodoText] = useState('');

  // Add a new todo
  const addTodo = () => {
    if (newTodoText.trim() === '') return;
    
    const newTodo: Todo = {
      id: Date.now(),
      text: newTodoText,
      completed: false,
    };
    
    setTodos([...todos, newTodo]);
    setNewTodoText('');
  };

  // Toggle todo completion status
  const toggleTodo = (id: number) => {
    setTodos(
      todos.map(todo => 
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  };

  // Delete a todo
  const deleteTodo = (id: number) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  // Handle key press (Enter to add todo)
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addTodo();
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-white rounded shadow">
      <h1 className="text-2xl font-bold mb-4 text-center">Todo List</h1>
      
      <div className="flex mb-4">
        <input
          type="text"
          className="flex-1 px-4 py-2 border rounded-l focus:outline-none"
          placeholder="Add a new todo..."
          value={newTodoText}
          onChange={e => setNewTodoText(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded-r hover:bg-blue-600"
          onClick={addTodo}
        >
          Add
        </button>
      </div>

      <ul className="divide-y">
        {todos.map(todo => (
          <li key={todo.id} className="py-2 flex items-center">
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id)}
              className="mr-2"
            />
            <span 
              className={`flex-1 ${todo.completed ? 'line-through text-gray-400' : ''}`}
            >
              {todo.text}
            </span>
            <button
              onClick={() => deleteTodo(todo.id)}
              className="text-red-500 hover:text-red-700"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 text-sm text-gray-500">
        {todos.filter(todo => !todo.completed).length} items left
      </div>
    </div>
  );
};

export default TodoList; 