const $ = (s) => document.querySelector(s);
const out = $('#out');
const token = $('#token');
const remember = $('#remember');
const saved = localStorage.getItem('go-server-token');
let currentShareUrl = '';
if (saved) { token.value = saved; remember.checked = true; }

function saveToken() {
  if (remember.checked && token.value) localStorage.setItem('go-server-token', token.value);
  else localStorage.removeItem('go-server-token');
}
remember.addEventListener('change', saveToken);
token.addEventListener('change', saveToken);

function uptimeLabel(seconds = 0) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}
function memoryLabel(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const units=['B','KB','MB','GB']; let n=bytes, i=0;
  while(n>=1024 && i<units.length-1){n/=1024;i++;}
  return `${n>=10?Math.round(n):Math.round(n*10)/10} ${units[i]}`;
}
function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function api(path, options = {}) {
  saveToken();
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type':'application/json', Authorization: `Bearer ${token.value}`, ...(options.headers||{}) }
  });
  const data = await response.json().catch(() => ({error:'invalid_response'}));
  if (response.status === 401) throw new Error('Token incorrecto. Usa el ADMIN_TOKEN generado durante la instalación.');
  if (!response.ok) throw new Error(data.message || data.error || 'Error de servidor');
  return data;
}

async function qrBlob(url) {
  const response = await fetch(`/api/qr?url=${encodeURIComponent(url)}`, {headers:{Authorization:`Bearer ${token.value}`}});
  if (!response.ok) throw new Error('No se pudo generar el QR');
  return response.blob();
}

function renderSystem(s) {
  $('#mCpu').textContent = `${s.cpu.busyPercent}%`;
  $('#mRam').textContent = `${s.memory.usedPercent}%`;
  $('#mDisk').textContent = `${s.disk.usedPercent}%`;
  $('#mHost').textContent = s.hostname || '—';
  $('#cpuBar').style.width = `${s.cpu.busyPercent}%`;
  $('#ramBar').style.width = `${s.memory.usedPercent}%`;
  $('#diskBar').style.width = `${s.disk.usedPercent}%`;
  $('#systemMeta').textContent = `${s.cpu.cores} núcleos · RAM ${s.memory.usedLabel}/${s.memory.totalLabel} · Disco ${s.disk.usedLabel}/${s.disk.totalLabel}`;
}

function renderProjects(projects = []) {
  const box = $('#projects');
  if (!projects.length) return box.innerHTML = '<div class="empty">Aún no hay proyectos en la carpeta de repositorios.</div>';
  box.innerHTML = projects.map(p => `<article class="project"><div><strong>${esc(p.name)}</strong><small>${p.isGit ? `Git · ${esc(p.branch || 'sin rama')} · ${esc(p.commit || '—')}` : 'Carpeta local'}${p.dirty ? ' · cambios pendientes' : ''}</small></div><span class="pill ${p.dirty?'warn':''}">${p.isGit ? (p.dirty?'Cambios':'Limpio') : 'Local'}</span></article>`).join('');
}

function renderProcesses(processes = []) {
  const box = $('#processes');
  if (!processes.length) return box.innerHTML = '<div class="empty">PM2 no tiene procesos registrados.</div>';
  box.innerHTML = processes.map(p => `<article class="process"><div class="process-main"><strong>${esc(p.name)}</strong><small>PID ${p.pid || '—'} · CPU ${p.cpu ?? '—'}% · RAM ${memoryLabel(p.memory)} · reinicios ${p.restarts}</small></div><span class="pill ${p.status==='online'?'online':'warn'}">${esc(p.status)}</span><div class="actions"><button data-action="restart" data-name="${esc(p.name)}">Reiniciar</button><button class="secondary" data-action="stop" data-name="${esc(p.name)}">Detener</button><button class="ghost" data-logs="${esc(p.name)}">Logs</button></div></article>`).join('');
  box.querySelectorAll('[data-action]').forEach(btn => btn.onclick = () => processAction(btn.dataset.name, btn.dataset.action));
  box.querySelectorAll('[data-logs]').forEach(btn => btn.onclick = () => showLogs(btn.dataset.logs));
}

async function renderRemoteStatus() {
  const box = $('#remoteStatus');
  try {
    const d = await api('/api/remote/status');
    box.innerHTML = `<span class="pill ${d.tailscale.online?'online':d.tailscale.installed?'warn':''}">Tailscale: ${d.tailscale.online?'conectado':d.tailscale.installed?'instalado':'no instalado'}</span><span class="pill ${d.cloudflared.installed?'online':''}">Cloudflare: ${d.cloudflared.installed?'listo':'no instalado'}</span>`;
    if (d.tailscale.url) box.innerHTML += `<span class="pill">${esc(d.tailscale.url.replace('https://',''))}</span>`;
  } catch (e) { box.innerHTML = `<span class="pill warn">${esc(e.message)}</span>`; }
}

async function refresh() {
  if (!token.value) return;
  $('#refresh').disabled = true;
  try {
    const [status, dash] = await Promise.all([api('/api/status'), api('/api/dashboard')]);
    $('#mStatus').textContent = status.ok ? 'Online' : 'Error';
    $('#mCommit').textContent = status.commit || '—';
    $('#mNode').textContent = status.node || '—';
    $('#mUptime').textContent = uptimeLabel(status.uptime);
    renderSystem(dash.system); renderProjects(dash.projects); renderProcesses(dash.processes);
    $('#reposDir').textContent = dash.reposDir;
    await renderRemoteStatus();
    out.textContent = `Actualizado ${new Date().toLocaleTimeString()}`;
  } catch (e) { out.textContent = e.message; }
  finally { $('#refresh').disabled = false; }
}

async function processAction(name, action) {
  if (!confirm(`${action === 'restart' ? '¿Reiniciar' : '¿Detener'} ${name}?`)) return;
  try { out.textContent = `Procesando ${name}…`; await api('/api/process/action',{method:'POST',body:JSON.stringify({name,action})}); await refresh(); }
  catch(e){out.textContent=e.message;}
}
async function showLogs(name) {
  try { out.textContent = `Cargando logs de ${name}…`; const d = await api(`/api/process/logs?name=${encodeURIComponent(name)}&lines=100`); out.textContent = d.logs || 'Sin logs.'; out.scrollIntoView({behavior:'smooth'}); }
  catch(e){out.textContent=e.message;}
}

async function setShareUrl(url) {
  currentShareUrl = url || '';
  const box = $('#shareBox');
  if (!url) { box.classList.remove('show'); return; }
  $('#shareUrl').href = url; $('#shareUrl').textContent = url; box.classList.add('show');
  try {
    const blob = await qrBlob(url);
    const img = $('#shareQr');
    if (img.dataset.objectUrl) URL.revokeObjectURL(img.dataset.objectUrl);
    img.dataset.objectUrl = URL.createObjectURL(blob); img.src = img.dataset.objectUrl;
  } catch { $('#shareQr').removeAttribute('src'); }
}
function remoteResult(html){ $('#remoteResult').innerHTML = html; }

$('#tailscaleServe').onclick = async () => {
  try {
    remoteResult('Configurando acceso privado por HTTPS…');
    const d = await api('/api/remote/tailscale/serve',{method:'POST',body:JSON.stringify({port:$('#remotePort').value})});
    remoteResult(`<strong>Tailscale Serve activo.</strong><div class="hint">Solo dispositivos autorizados de tu tailnet podrán entrar.</div>`);
    if (d.url) await setShareUrl(d.url);
    await renderRemoteStatus();
  } catch(e){ remoteResult(`<strong>No se pudo activar Tailscale.</strong><div class="hint">${esc(e.message)} · Si no está instalado, usa la app/CLI de Tailscale y vuelve a intentarlo.</div>`); }
};
$('#tailscaleReset').onclick = async () => {
  if(!confirm('¿Quitar la configuración Tailscale Serve de este dispositivo?')) return;
  try { await api('/api/remote/tailscale/reset',{method:'POST'}); remoteResult('Tailscale Serve desactivado.'); await setShareUrl(''); await renderRemoteStatus(); }
  catch(e){remoteResult(esc(e.message));}
};
$('#cloudflareStart').onclick = async () => {
  if(!confirm('La URL temporal será pública en Internet. ¿Continuar?')) return;
  try {
    remoteResult('Creando túnel público temporal…');
    const d = await api('/api/remote/cloudflare/start',{method:'POST',body:JSON.stringify({name:$('#remoteName').value,port:$('#remotePort').value})});
    remoteResult(`<strong>Cloudflare Quick Tunnel activo.</strong><div class="hint">${d.url ? 'Enlace HTTPS listo para compartir.' : 'El túnel arrancó; la URL puede tardar unos segundos. Revisa los logs del proceso '+esc(d.processName)+'.'}</div>`);
    if (d.url) await setShareUrl(d.url);
    await refresh();
  } catch(e){remoteResult(`<strong>No se pudo crear el túnel.</strong><div class="hint">${esc(e.message)}</div>`);}
};
$('#cloudflareStop').onclick = async () => {
  if(!confirm('¿Cerrar la URL pública temporal?')) return;
  try { await api('/api/remote/cloudflare/stop',{method:'POST',body:JSON.stringify({name:$('#remoteName').value})}); remoteResult('URL temporal cerrada.'); await setShareUrl(''); await refresh(); }
  catch(e){remoteResult(esc(e.message));}
};
$('#hostnameGuide').onclick = async () => {
  try {
    const d = await api('/api/remote/cloudflare/hostname/guide',{method:'POST',body:JSON.stringify({hostname:$('#remoteHostname').value,port:$('#remotePort').value})});
    remoteResult(`<strong>${esc(d.hostname)}</strong><div class="hint">En Cloudflare: Networking → Tunnels → tu túnel → Routes → Add route → Published application.<br>Hostname: <b>${esc(d.hostname)}</b><br>Service URL: <b>${esc(d.service)}</b></div>`);
    await setShareUrl(`https://${d.hostname}`);
  } catch(e){remoteResult(`<strong>Revisa el dominio.</strong><div class="hint">${esc(e.message)}</div>`);}
};
$('#copyUrl').onclick = async () => { if(currentShareUrl){ await navigator.clipboard.writeText(currentShareUrl); out.textContent='Enlace copiado.'; } };
$('#shareUrlBtn').onclick = async () => { if(!currentShareUrl)return; if(navigator.share) await navigator.share({title:'Go Server',url:currentShareUrl}); else await navigator.clipboard.writeText(currentShareUrl); };

$('#refresh').onclick = refresh;
$('#update').onclick = async () => { if(!confirm('¿Actualizar Go Server desde GitHub ahora?'))return; try{out.textContent='Actualizando…'; const d=await api('/api/update',{method:'POST'}); out.textContent=d.stdout||'Actualizado.';}catch(e){out.textContent=e.message;} };
$('#sync').onclick = async () => { if(!confirm('¿Respaldar y sincronizar ahora todos los repositorios?'))return; try{out.textContent='Sincronizando repos…'; const d=await api('/api/sync',{method:'POST'}); out.textContent=[d.stdout,d.stderr].filter(Boolean).join('\n')||'Sin cambios.'; await refresh();}catch(e){out.textContent=e.message;} };

fetch('/api/health').then(r=>r.json()).then(data=>{ $('#healthDot').classList.toggle('on',Boolean(data.ok)); $('#healthText').textContent=data.ok?'Servidor en línea':'Servidor no disponible'; }).catch(()=>{$('#healthText').textContent='Servidor no disponible';});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
if (token.value) refresh();

function deployMessage(html) { $('#deployResult').innerHTML = html; }
$('#inspectRepo').onclick = async () => {
  const repoUrl = $('#repoUrl').value.trim();
  if (!repoUrl) return deployMessage('<strong>Falta el repositorio.</strong><div class="hint">Pega una URL de GitHub para continuar.</div>');
  try { deployMessage('Revisando repositorio…'); const d = await api('/api/apps/inspect', {method:'POST', body:JSON.stringify({repoUrl})}); if (!$('#appName').value) $('#appName').value = d.name; if (!$('#appPort').value) $('#appPort').value = d.suggestedPort; deployMessage(`<strong>${esc(d.name)}</strong><div class="hint">${d.exists ? 'Ya existe en el servidor.' : 'Listo para clonar.'} Puerto sugerido: ${d.suggestedPort}</div>`); }
  catch (e) { deployMessage(`<strong>No se pudo revisar.</strong><div class="hint">${esc(e.message)}</div>`); }
};
$('#deployRepo').onclick = async () => {
  const repoUrl = $('#repoUrl').value.trim(), name = $('#appName').value.trim(), port = $('#appPort').value.trim(), install = $('#deployNow').checked;
  if (!repoUrl) return deployMessage('<strong>Falta el repositorio.</strong>');
  const action = install ? 'clonar, instalar dependencias y ejecutar código de este repositorio' : 'clonar este repositorio';
  if (!confirm(`Go Server va a ${action}. ¿Continuar?`)) return;
  $('#deployRepo').disabled = true; $('#inspectRepo').disabled = true;
  try { deployMessage('Preparando app…'); const d = await api('/api/apps/deploy', {method:'POST', body:JSON.stringify({repoUrl,name:name||undefined,port:port||undefined,install})}); const host = location.hostname || 'localhost'; const link = d.installed ? `http://${host}:${d.port}` : ''; deployMessage(`<strong>${esc(d.name)} · ${esc(d.stack.label)}</strong><div class="hint">${d.installed ? `Publicada en <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>` : 'Repositorio clonado. Instalación pendiente.'}</div>`); $('#remoteName').value=d.name; $('#remotePort').value=d.port; await refresh(); }
  catch (e) { deployMessage(`<strong>No se pudo desplegar.</strong><div class="hint">${esc(e.message)}</div>`); }
  finally { $('#deployRepo').disabled = false; $('#inspectRepo').disabled = false; }
};
