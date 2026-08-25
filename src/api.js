const API_URL = import.meta.env.VITE_API_URL ?? '';

function authHeaders(extra = {}) {
  const token = localStorage.getItem('zona_admin_token');
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `API вернул неожиданный ответ (${res.status}). Проверь запуск Node API на порту 8788.`
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка API');
  return data;
}

export async function getProducts(admin = false) {
  return request(`/api/products${admin ? '?admin=1' : ''}`);
}

export async function getCategories() {
  return request('/api/categories');
}

export async function adminLogin(email, password) {
  return request('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function addProduct(payload) {
  return request('/api/admin/products', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function editProduct(id, payload) {
  return request(`/api/admin/products/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function removeProduct(id) {
  return request(`/api/admin/products/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function uploadImage(file) {
  const form = new FormData();
  form.append('image', file);

  const token = localStorage.getItem('zona_admin_token');
  const res = await fetch(`${API_URL}/api/admin/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
  return data.url;
}


export async function createOrder(payload) {
  return request('/api/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getAdminOrders() {
  return request('/api/admin/orders', { headers: authHeaders() });
}

export async function updateOrderStatus(id, status) {
  return request(`/api/admin/orders/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
}
