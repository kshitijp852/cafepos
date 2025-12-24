// LocalStorage utility functions for user session management

export const saveUser = (user) => {
  localStorage.setItem('pos_user', JSON.stringify(user));
};

export const getUser = () => {
  const user = localStorage.getItem('pos_user');
  return user ? JSON.parse(user) : null;
};

export const removeUser = () => {
  localStorage.removeItem('pos_user');
};

export const saveToken = (token) => {
  localStorage.setItem('pos_token', token);
};

export const getToken = () => {
  return localStorage.getItem('pos_token');
};

export const removeToken = () => {
  localStorage.removeItem('pos_token');
};

export const clearAuth = () => {
  removeUser();
  removeToken();
};
