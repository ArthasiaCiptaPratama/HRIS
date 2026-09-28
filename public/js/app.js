// ================================================
// HRIS Main Application
// ================================================

// Global state
let currentEmployee = null;
let leaveChart = null;
let departmentChart = null;
let leaveQuotaChart = null;

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide icons
  lucide.createIcons();

  // Setup event listeners
  setupNavigation();
  setupModals();
  setupForms();
  setupMobileMenu();

  // Load initial data
  await loadInitialData();
});

// ================================================
// Navigation
// ================================================
function setupNavigation() {
  // Top nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      navigateToPage(page);
    });
  });

  // Sidebar links
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      showPersonalSection(section);
    });
  });

  // Chart card shortcuts
  document.querySelectorAll('.chart-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const feature = card.dataset.feature;
      navigateToPage('personal');
      setTimeout(() => showPersonalSection(feature), 100);
    });
  });
}

function navigateToPage(page) {
  // Update top nav
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  // Update pages
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === `${page}Page`);
  });

  // Load page data
  if (page === 'dashboard') {
    loadDashboardData();
  } else if (page === 'personal') {
    loadPersonalData();
  }

  // Re-initialize icons
  lucide.createIcons();
}

function showPersonalSection(section) {
  // Update sidebar links
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.toggle('active', link.dataset.section === section);
  });

  // Update sections
  document.querySelectorAll('.content-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `${section}Section`);
  });

  // Load section data
  if (section === 'leave-quota') {
    loadLeaveQuotaData();
  } else if (section === 'attendance') {
    loadAttendanceData();
  } else if (section === 'business-trip') {
    loadBusinessTripData();
  }

  // Re-initialize icons
  lucide.createIcons();
}

// ================================================
// Mobile Menu
// ================================================
function setupMobileMenu() {
  const toggle = document.getElementById('mobileMenuToggle');
  const navLinks = document.querySelector('.nav-links');

  toggle?.addEventListener('click', () => {
    navLinks.classList.toggle('active');
  });
}

// ================================================
// Modals
// ================================================
function setupModals() {
  // Open modal buttons
  document.getElementById('addAttendanceBtn')?.addEventListener('click', () => {
    openModal('attendanceModal');
  });

  document.getElementById('addBusinessTripBtn')?.addEventListener('click', () => {
    openModal('businessTripModal');
  });

  // Close modal buttons
  document.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.modal);
    });
  });

  // Close on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', () => {
      backdrop.closest('.modal').classList.remove('active');
    });
  });
}

function openModal(modalId) {
  document.getElementById(modalId)?.classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove('active');
}

// ================================================
// Forms
// ================================================
function setupForms() {
  // Attendance form
  document.getElementById('attendanceForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = {
      employeeId: currentEmployee?.id,
      type: form.attendanceType.value,
      date: form.attendanceDate.value,
      reason: form.attendanceReason.value,
    };

    try {
      await api.createAttendancePermission(data);
      showToast('Izin berhasil diajukan', 'success');
      closeModal('attendanceModal');
      form.reset();
      loadAttendanceData();
    } catch (error) {
      showToast('Gagal mengajukan izin', 'error');
    }
  });

  // Business trip form
  document.getElementById('businessTripForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = {
      employeeId: currentEmployee?.id,
      destination: form.tripDestination.value,
      purpose: form.tripPurpose.value,
      startDate: form.tripStartDate.value,
      endDate: form.tripEndDate.value,
    };

    try {
      await api.createBusinessTrip(data);
      showToast('Perjalanan dinas berhasil diajukan', 'success');
      closeModal('businessTripModal');
      form.reset();
      loadBusinessTripData();
    } catch (error) {
      showToast('Gagal mengajukan perjalanan dinas', 'error');
    }
  });
}

// ================================================
// Initial Data Load
// ================================================
async function loadInitialData() {
  try {
    // Get first employee as current user (for demo)
    const employees = await api.getEmployees();
    if (employees.length > 0) {
      currentEmployee = employees[0];
      updateUserInfo();
    }

    // Load dashboard
    await loadDashboardData();
  } catch (error) {
    console.error('Failed to load initial data:', error);
    showToast('Gagal memuat data. Pastikan server berjalan.', 'error');
  }
}

function updateUserInfo() {
  if (!currentEmployee) return;

  const avatarImg = document.querySelector('#userAvatar img');
  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRole');

  if (avatarImg) avatarImg.src = currentEmployee.photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentEmployee.name}`;
  if (nameEl) nameEl.textContent = currentEmployee.name;
  if (roleEl) roleEl.textContent = currentEmployee.position;
}

// ================================================
// Dashboard
// ================================================
async function loadDashboardData() {
  try {
    const [stats, employees] = await Promise.all([
      api.getDashboardStats(),
      api.getEmployees(),
    ]);

    // Update stats
    document.getElementById('totalEmployees').textContent = stats.totalEmployees || 0;
    document.getElementById('pendingRequests').textContent = stats.pendingRequests || 0;
    document.getElementById('leaveQuotaStat').textContent = `${stats.leaveQuota?.remaining || 0} hari`;
    document.getElementById('attendanceStat').textContent = stats.pendingAttendance || 0;
    document.getElementById('businessTripStat').textContent = stats.pendingBusinessTrips || 0;

    // Leave chart
    renderLeaveChart(stats.leaveQuota);

    // Department chart
    renderDepartmentChart(employees);
  } catch (error) {
    console.error('Failed to load dashboard:', error);
  }
}

function renderLeaveChart(data) {
  const ctx = document.getElementById('leaveChart');
  if (!ctx) return;

  if (leaveChart) leaveChart.destroy();

  leaveChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Terpakai', 'Tersedia'],
      datasets: [{
        data: [data.used || 0, data.remaining || 0],
        backgroundColor: ['#4f46e5', '#e0e7ff'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.label}: ${context.raw} hari`,
          },
        },
      },
    },
  });
}

function renderDepartmentChart(employees) {
  const ctx = document.getElementById('departmentChart');
  if (!ctx) return;

  // Count employees by department
  const departments = {};
  employees.forEach(emp => {
    departments[emp.department] = (departments[emp.department] || 0) + 1;
  });

  const labels = Object.keys(departments);
  const data = Object.values(departments);
  const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

  if (departmentChart) departmentChart.destroy();

  departmentChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
        },
      },
    },
  });
}

// ================================================
// Personal Data
// ================================================
async function loadPersonalData() {
  if (!currentEmployee) {
    const employees = await api.getEmployees();
    if (employees.length > 0) {
      currentEmployee = employees[0];
    }
  }

  if (currentEmployee) {
    // Load full employee data
    const fullEmployee = await api.getEmployee(currentEmployee.id);
    currentEmployee = fullEmployee;

    // Update profile
    updateProfile(fullEmployee);
    updateUserInfo();

    // Load first section
    showPersonalSection('profile');
  }
}

function updateProfile(employee) {
  document.getElementById('profileAvatar').innerHTML =
    `<img src="${employee.photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${employee.name}`}" alt="Profile">`;
  document.getElementById('profileName').textContent = employee.name;
  document.getElementById('profilePosition').textContent = employee.position;
  document.getElementById('profileDepartment').textContent = employee.department;
  document.getElementById('profileEmail').textContent = employee.email;
  document.getElementById('profilePhone').textContent = employee.phone || '-';
  document.getElementById('profileAddress').textContent = employee.address || '-';
  document.getElementById('profileJoinDate').textContent = formatDate(employee.joinDate);
}

// ================================================
// Leave Quota
// ================================================
async function loadLeaveQuotaData() {
  if (!currentEmployee) return;

  try {
    const quotas = await api.getLeaveQuotas(currentEmployee.id);
    renderLeaveQuotaChart(quotas);
    renderLeaveQuotaTable(quotas);
  } catch (error) {
    console.error('Failed to load leave quotas:', error);
  }
}

function renderLeaveQuotaChart(quotas) {
  const ctx = document.getElementById('leaveQuotaChart');
  if (!ctx) return;

  const labels = quotas.map(q => getLeaveTypeLabel(q.leaveType));
  const usedData = quotas.map(q => q.usedDays);
  const remainingData = quotas.map(q => q.totalDays - q.usedDays);

  if (leaveQuotaChart) leaveQuotaChart.destroy();

  leaveQuotaChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Terpakai',
          data: usedData,
          backgroundColor: '#4f46e5',
        },
        {
          label: 'Tersedia',
          data: remainingData,
          backgroundColor: '#e0e7ff',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true },
      },
      plugins: {
        legend: { position: 'bottom' },
      },
    },
  });
}

function renderLeaveQuotaTable(quotas) {
  const tbody = document.getElementById('leaveQuotaTable');
  if (!tbody) return;

  if (quotas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Tidak ada data jatah cuti</td></tr>';
    return;
  }

  tbody.innerHTML = quotas.map(q => {
    const percentage = (q.usedDays / q.totalDays) * 100;
    const remaining = q.totalDays - q.usedDays;
    const colorClass = q.leaveType === 'ANNUAL' ? 'leave-annual' :
                      q.leaveType === 'SICK' ? 'leave-sick' : 'leave-personal';

    return `
      <tr>
        <td>${getLeaveTypeLabel(q.leaveType)}</td>
        <td>${q.totalDays} hari</td>
        <td>${q.usedDays} hari</td>
        <td>${remaining} hari</td>
        <td>
          <div class="progress-bar">
            <div class="progress-fill ${colorClass}" style="width: ${percentage}%"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ================================================
// Attendance
// ================================================
async function loadAttendanceData() {
  try {
    const permissions = await api.getAttendancePermissions();
    renderAttendanceList(permissions);
  } catch (error) {
    console.error('Failed to load attendance:', error);
  }
}

function renderAttendanceList(permissions) {
  const container = document.getElementById('attendanceList');
  if (!container) return;

  if (permissions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="inbox"></i>
        <h4>Belum Ada Pengajuan</h4>
        <p>Ajukan izin hadir untuk melihat daftar di sini</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = permissions.map(p => `
    <div class="request-card">
      <div class="request-icon ${getAttendanceIconClass(p.type)}">
        <i data-lucide="${getAttendanceIcon(p.type)}"></i>
      </div>
      <div class="request-content">
        <h4>${getAttendanceTypeLabel(p.type)}</h4>
        <p>${p.reason}</p>
        <div class="request-meta">
          <span><i data-lucide="calendar"></i> ${formatDate(p.date)}</span>
          <span><i data-lucide="user"></i> ${p.employee?.name || 'Unknown'}</span>
        </div>
      </div>
      <span class="request-status ${p.status.toLowerCase()}">${getStatusLabel(p.status)}</span>
    </div>
  `).join('');

  lucide.createIcons();
}

// ================================================
// Business Trip
// ================================================
async function loadBusinessTripData() {
  try {
    const trips = await api.getBusinessTrips();
    renderBusinessTripList(trips);
  } catch (error) {
    console.error('Failed to load business trips:', error);
  }
}

function renderBusinessTripList(trips) {
  const container = document.getElementById('businessTripList');
  if (!container) return;

  if (trips.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="inbox"></i>
        <h4>Belum Ada Perjalanan Dinas</h4>
        <p>Ajukan perjalanan dinas untuk melihat daftar di sini</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = trips.map(t => `
    <div class="request-card">
      <div class="request-icon trip">
        <i data-lucide="plane"></i>
      </div>
      <div class="request-content">
        <h4>${t.destination}</h4>
        <p>${t.purpose}</p>
        <div class="request-meta">
          <span><i data-lucide="calendar"></i> ${formatDate(t.startDate)} - ${formatDate(t.endDate)}</span>
          <span><i data-lucide="user"></i> ${t.employee?.name || 'Unknown'}</span>
        </div>
      </div>
      <span class="request-status ${t.status.toLowerCase()}">${getStatusLabel(t.status)}</span>
    </div>
  `).join('');

  lucide.createIcons();
}

// ================================================
// Utilities
// ================================================
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getLeaveTypeLabel(type) {
  const labels = {
    ANNUAL: 'Cuti Tahunan',
    SICK: 'Cuti Sakit',
    PERSONAL: 'Cuti Pribadi',
  };
  return labels[type] || type;
}

function getAttendanceTypeLabel(type) {
  const labels = {
    SICK: 'Sakit',
    PERMIT: 'Izin',
    BUSINESS: 'Tugas Dinas',
  };
  return labels[type] || type;
}

function getAttendanceIcon(type) {
  const icons = {
    SICK: 'thermometer',
    PERMIT: 'file-text',
    BUSINESS: 'briefcase',
  };
  return icons[type] || 'file-text';
}

function getAttendanceIconClass(type) {
  const classes = {
    SICK: 'sick',
    PERMIT: 'permit',
    BUSINESS: 'business',
  };
  return classes[type] || 'permit';
}

function getStatusLabel(status) {
  const labels = {
    PENDING: 'Menunggu',
    APPROVED: 'Disetujui',
    REJECTED: 'Ditolak',
  };
  return labels[status] || status;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? 'check-circle' :
               type === 'error' ? 'x-circle' :
               type === 'warning' ? 'alert-triangle' : 'info';

  toast.innerHTML = `
    <i data-lucide="${icon}"></i>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  // Auto remove after 4 seconds
  setTimeout(() => {
    toast.style.animation = 'toastSlideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Make functions globally available
window.navigateToPage = navigateToPage;
window.showPersonalSection = showPersonalSection;
