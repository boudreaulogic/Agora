'use client';

import { useState } from 'react';

var CATEGORIES = [
  { id: 'all', label: 'All', icon: '🏪' },
  { id: 'table_features', label: 'Table Features', icon: '⚡' },
  { id: 'solutions', label: 'Solutions', icon: '📦' },
  { id: 'connectors', label: 'Data Connectors', icon: '🔌' },
];

interface AddOn {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  icon: string;
  category: string;
  type: 'feature' | 'solution' | 'connector';
  featureKey?: string;
  customInstall?: boolean;
  status: 'available' | 'coming_soon';
  tags: string[];
}

var ADDONS: AddOn[] = [
  {
    id: 'forms',
    name: 'Forms',
    description: 'Create public submission forms linked to your tables.',
    longDescription: 'Build multi-page forms with field validation, repeating groups, calculated fields, and custom thank-you messages. Forms submit directly to your table with real-time updates.',
    icon: '📋',
    category: 'table_features',
    type: 'feature',
    featureKey: 'forms',
    status: 'available',
    tags: ['data entry', 'public', 'submissions'],
  },
  {
    id: 'charts',
    name: 'Charts & Visualization',
    description: 'Build charts and dashboards from your table data.',
    longDescription: 'Create bar, line, area, pie, and donut charts. Multi-table query engine lets you aggregate data across linked tables. Pin charts to your dashboard for at-a-glance insights.',
    icon: '📊',
    category: 'table_features',
    type: 'feature',
    featureKey: 'charts',
    status: 'available',
    tags: ['visualization', 'dashboard', 'analytics'],
  },
  {
    id: 'approvals',
    name: 'Approval Workflows',
    description: 'Multi-stage approval chains with email notifications.',
    longDescription: 'Define approval stages with multiple approvers, group-based routing, and dynamic approver columns. Includes SHA-256 hash-chained audit ledger, row locking during review, and email notifications at each stage.',
    icon: '✅',
    category: 'table_features',
    type: 'feature',
    featureKey: 'approvals',
    status: 'available',
    tags: ['workflow', 'automation', 'compliance'],
  },
  {
    id: 'record_export',
    name: 'Record Export',
    description: 'Export individual records as formatted documents.',
    longDescription: 'Upload Word document templates with field placeholders. Generate formatted PDFs or DOCX files for individual records with one click. Includes optional audit trail page.',
    icon: '📄',
    category: 'table_features',
    type: 'feature',
    featureKey: 'record_export',
    status: 'available',
    tags: ['documents', 'pdf', 'templates'],
  },
  {
    id: 'it_inventory',
    name: 'IT Device Inventory',
    description: 'Track all devices across your organization with automated scripts.',
    longDescription: 'Deploy lightweight scripts on Windows, macOS, and Linux that automatically collect device information (hostname, serial, OS, CPU, RAM, storage, MAC address) and report back to Agora via API. Includes pre-built table schema and dashboard.',
    icon: '💻',
    category: 'solutions',
    type: 'solution',
    status: 'coming_soon',
    tags: ['IT', 'hardware', 'automation', 'scripts'],
  },
  {
    id: 'data_connectors',
    name: 'Data Connectors',
    description: 'Connect external REST APIs and sync data into your tables.',
    longDescription: 'Pull data from any REST API into Agora tables. Supports bearer token, API key, and basic auth. Map JSON fields to columns, set sync schedules, and upsert by unique key.',
    icon: '🔗',
    category: 'table_features',
    type: 'feature',
    featureKey: 'data_connectors',
    status: 'available',
    tags: ['API', 'sync', 'integration', 'import'],
  },
  {
    id: 'api_access',
    name: 'API Access & Keys',
    description: 'Generate scoped API keys for external scripts and integrations.',
    longDescription: 'Create API keys scoped to specific tables with read, write, or admin permissions. Keys are SHA-256 hashed, rate-limited, and can be set to expire.',
    icon: '🔌',
    category: 'table_features',
    type: 'feature',
    featureKey: 'api_access',
    status: 'available',
    tags: ['API', 'keys', 'scripts', 'automation'],
  },
  {
    id: 'booking_system',
    name: 'Booking System',
    description: 'Resource booking with conflict detection and calendar view.',
    longDescription: 'Add booking columns (Start, End, Resource) to any table. Automatic conflict detection prevents double-bookings. Combine with Forms for public booking requests and Approval Workflows for managed reservations. Calendar view shows all bookings by resource.',
    icon: '📅',
    category: 'solutions',
    type: 'feature',
    featureKey: 'booking',
    customInstall: true,
    status: 'available',
    tags: ['scheduling', 'calendar', 'appointments', 'rooms', 'facilities'],
  },
  {
    id: 'helpdesk',
    name: 'Helpdesk & Tickets',
    description: 'Ticket submission, assignment, tracking, and resolution.',
    longDescription: 'Public ticket submission form, automatic assignment rules, status tracking with Kanban view, SLA timers, and resolution workflows.',
    icon: '🎫',
    category: 'solutions',
    type: 'solution',
    status: 'coming_soon',
    tags: ['support', 'tickets', 'IT', 'customer service'],
  },
  {
    id: 'simple_crm',
    name: 'Simple CRM',
    description: 'Contact management with deal pipeline and follow-ups.',
    longDescription: 'Track contacts, companies, and deals through your sales pipeline. Kanban view for deal stages, activity logging, and follow-up reminders.',
    icon: '🤝',
    category: 'solutions',
    type: 'solution',
    status: 'coming_soon',
    tags: ['sales', 'contacts', 'pipeline', 'business'],
  },
  {
    id: 'rest_api_connector',
    name: 'REST API Connector',
    description: 'Connect any REST API and sync data into Agora tables.',
    longDescription: 'Point at any REST API endpoint, map JSON fields to table columns, and set a sync schedule.',
    icon: '🔌',
    category: 'connectors',
    type: 'connector',
    status: 'coming_soon',
    tags: ['API', 'integration', 'sync', 'import'],
  },
  {
    id: 'postgres_connector',
    name: 'PostgreSQL Connector',
    description: 'Connect to external PostgreSQL databases.',
    longDescription: 'Import tables from external PostgreSQL databases into Agora.',
    icon: '🐘',
    category: 'connectors',
    type: 'connector',
    status: 'coming_soon',
    tags: ['database', 'PostgreSQL', 'sync', 'import'],
  },
  {
    id: 'mysql_connector',
    name: 'MySQL Connector',
    description: 'Connect to external MySQL databases.',
    longDescription: 'Import tables from MySQL databases.',
    icon: '🐬',
    category: 'connectors',
    type: 'connector',
    status: 'coming_soon',
    tags: ['database', 'MySQL', 'sync', 'import'],
  },
  {
    id: 'mongodb_connector',
    name: 'MongoDB Connector',
    description: 'Connect to MongoDB collections.',
    longDescription: 'Map MongoDB document collections to Agora tables.',
    icon: '🍃',
    category: 'connectors',
    type: 'connector',
    status: 'coming_soon',
    tags: ['database', 'MongoDB', 'NoSQL', 'sync'],
  },
];

export function MarketplaceClient({ tables }: { tables: any[] }) {
  var [selectedCategory, setSelectedCategory] = useState('all');
  var [searchQuery, setSearchQuery] = useState('');
  var [selectedAddOn, setSelectedAddOn] = useState<AddOn | null>(null);
  var [selectedTableId, setSelectedTableId] = useState('');
  var [installing, setInstalling] = useState(false);
  var [installResult, setInstallResult] = useState<{ success: boolean; message: string } | null>(null);
  // Booking system install state
  var [bookingStartName, setBookingStartName] = useState('Start Date/Time');
  var [bookingEndName, setBookingEndName] = useState('End Date/Time');
  var [bookingResourceName, setBookingResourceName] = useState('Resource');
  var [bookingResources, setBookingResources] = useState('');

  var filteredAddons = ADDONS.filter(function(addon) {
    if (selectedCategory !== 'all' && addon.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      var q = searchQuery.toLowerCase();
      return addon.name.toLowerCase().includes(q) ||
        addon.description.toLowerCase().includes(q) ||
        addon.tags.some(function(t) { return t.toLowerCase().includes(q); });
    }
    return true;
  });

  function isFeatureInstalled(featureKey: string, tableId: string): boolean {
    var table = tables.find(function(t) { return t.id === tableId; });
    if (!table) return false;
    var features = (table.enabledFeatures as string[]) || [];
    return features.includes(featureKey);
  }

  function handleInstall() {
    if (!selectedAddOn || !selectedTableId || installing) return;
    if (!selectedAddOn.featureKey) return;

    // Booking system has custom install
    if (selectedAddOn.customInstall) {
      handleBookingInstall();
      return;
    }

    setInstalling(true);
    setInstallResult(null);

    fetch('/api/tables/' + selectedTableId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enableFeature: selectedAddOn.featureKey }),
    }).then(function(res) {
      return res.json().then(function(data) {
        if (res.ok) {
          setInstallResult({ success: true, message: selectedAddOn!.name + ' has been enabled on your table.' });
          var tableIdx = tables.findIndex(function(t) { return t.id === selectedTableId; });
          if (tableIdx >= 0) {
            var features = ((tables[tableIdx].enabledFeatures as string[]) || []).slice();
            if (!features.includes(selectedAddOn!.featureKey!)) {
              features.push(selectedAddOn!.featureKey!);
              tables[tableIdx].enabledFeatures = features;
            }
          }
        } else {
          setInstallResult({ success: false, message: data.error || 'Failed to install' });
        }
      });
    }).catch(function() {
      setInstallResult({ success: false, message: 'Failed to install' });
    }).finally(function() { setInstalling(false); });
  }

  function handleBookingInstall() {
    if (!selectedTableId || installing) return;
    setInstalling(true);
    setInstallResult(null);

    var resourceOptions = bookingResources.split(',').map(function(r) { return r.trim(); }).filter(function(r) { return r.length > 0; });

    fetch('/api/tables/' + selectedTableId + '/booking/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startColumnName: bookingStartName.trim() || 'Start Date/Time',
        endColumnName: bookingEndName.trim() || 'End Date/Time',
        resourceColumnName: bookingResourceName.trim() || 'Resource',
        resourceOptions: resourceOptions,
      }),
    }).then(function(res) {
      return res.json().then(function(data) {
        if (res.ok) {
          setInstallResult({ success: true, message: 'Booking system installed! 3 columns added: ' + data.columns.start.name + ', ' + data.columns.end.name + ', ' + data.columns.resource.name + '. Conflict detection is now active.' });
          var tableIdx = tables.findIndex(function(t) { return t.id === selectedTableId; });
          if (tableIdx >= 0) {
            var features = ((tables[tableIdx].enabledFeatures as string[]) || []).slice();
            if (!features.includes('booking')) { features.push('booking'); tables[tableIdx].enabledFeatures = features; }
          }
        } else {
          setInstallResult({ success: false, message: data.error || 'Failed to install booking system' });
        }
      });
    }).catch(function() {
      setInstallResult({ success: false, message: 'Failed to install booking system' });
    }).finally(function() { setInstalling(false); });
  }

  function handleUninstall() {
    if (!selectedAddOn || !selectedTableId || installing) return;
    if (!selectedAddOn.featureKey) return;

    if (!confirm('Remove ' + selectedAddOn.name + ' from this table? Your data won\'t be deleted, but the feature will be hidden.')) return;

    setInstalling(true);
    setInstallResult(null);

    // Booking has custom uninstall
    if (selectedAddOn.customInstall) {
      fetch('/api/tables/' + selectedTableId + '/booking/install', { method: 'DELETE' })
        .then(function(res) { return res.json().then(function(data) {
          if (res.ok) {
            setInstallResult({ success: true, message: 'Booking system removed. Columns and data preserved.' });
            var tableIdx = tables.findIndex(function(t) { return t.id === selectedTableId; });
            if (tableIdx >= 0) {
              var features = ((tables[tableIdx].enabledFeatures as string[]) || []).filter(function(f: string) { return f !== 'booking'; });
              tables[tableIdx].enabledFeatures = features;
            }
          } else { setInstallResult({ success: false, message: data.error || 'Failed to remove' }); }
        }); })
        .catch(function() { setInstallResult({ success: false, message: 'Failed to remove' }); })
        .finally(function() { setInstalling(false); });
      return;
    }

    fetch('/api/tables/' + selectedTableId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disableFeature: selectedAddOn.featureKey }),
    }).then(function(res) {
      return res.json().then(function(data) {
        if (res.ok) {
          setInstallResult({ success: true, message: selectedAddOn!.name + ' has been removed from your table.' });
          var tableIdx = tables.findIndex(function(t) { return t.id === selectedTableId; });
          if (tableIdx >= 0) {
            var features = ((tables[tableIdx].enabledFeatures as string[]) || []).filter(function(f: string) { return f !== selectedAddOn!.featureKey; });
            tables[tableIdx].enabledFeatures = features;
          }
        } else { setInstallResult({ success: false, message: data.error || 'Failed to remove' }); }
      });
    }).catch(function() {
      setInstallResult({ success: false, message: 'Failed to remove' });
    }).finally(function() { setInstalling(false); });
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <span className="text-3xl">📦</span>
          <h1 className="text-2xl font-bold text-gray-900">Agora Marketplace</h1>
        </div>
        <p className="text-sm text-gray-500">Add features, solutions, and connectors to your tables.</p>
      </div>

      <div className="flex items-center space-x-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <input type="text" value={searchQuery} onChange={function(e) { setSearchQuery(e.target.value); }}
            placeholder="Search add-ons..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900" />
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          {CATEGORIES.map(function(cat) {
            return (<button key={cat.id} onClick={function() { setSelectedCategory(cat.id); }}
              className={'px-3 py-1.5 text-xs rounded-md transition-all font-medium ' + (selectedCategory === cat.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              <span className="mr-1">{cat.icon}</span>{cat.label}
            </button>);
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAddons.map(function(addon) {
          var isComingSoon = addon.status === 'coming_soon';
          return (
            <div key={addon.id}
              onClick={function() { if (!isComingSoon) { setSelectedAddOn(addon); setSelectedTableId(''); setInstallResult(null); setBookingStartName('Start Date/Time'); setBookingEndName('End Date/Time'); setBookingResourceName('Resource'); setBookingResources(''); } }}
              className={'relative border rounded-xl p-5 transition-all ' + (isComingSoon ? 'border-gray-200 bg-gray-50 opacity-60 cursor-default' : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md cursor-pointer')}>
              {isComingSoon && (<span className="absolute top-3 right-3 text-[9px] font-bold uppercase tracking-wider bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Coming Soon</span>)}
              <div className="flex items-start space-x-3">
                <span className="text-2xl">{addon.icon}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-900">{addon.name}</h3>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{addon.description}</p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {addon.tags.slice(0, 3).map(function(tag) { return (<span key={tag} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{tag}</span>); })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredAddons.length === 0 && (<div className="text-center py-12"><p className="text-gray-400 text-sm">No add-ons match your search.</p></div>)}

      {/* Add-on Detail Modal */}
      {selectedAddOn && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={function() { setSelectedAddOn(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] overflow-y-auto" onClick={function(e) { e.stopPropagation(); }}>
            <div className="px-6 py-5 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-3xl">{selectedAddOn.icon}</span>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{selectedAddOn.name}</h2>
                    <span className={'text-[10px] font-medium px-2 py-0.5 rounded-full ' +
                      (selectedAddOn.type === 'feature' ? 'bg-blue-100 text-blue-700' :
                       selectedAddOn.type === 'solution' ? 'bg-purple-100 text-purple-700' :
                       'bg-green-100 text-green-700')}>
                      {selectedAddOn.type === 'feature' ? 'Table Feature' : selectedAddOn.type === 'solution' ? 'Solution' : 'Connector'}
                    </span>
                  </div>
                </div>
                <button onClick={function() { setSelectedAddOn(null); }} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">{selectedAddOn.longDescription}</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedAddOn.tags.map(function(tag) { return <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{tag}</span>; })}
              </div>

              {/* Install section for features (including booking) */}
              {selectedAddOn.featureKey && selectedAddOn.status === 'available' && (
                <div className="border-t border-gray-200 pt-4">
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Select a table to install on:</label>
                  <select value={selectedTableId} onChange={function(e) { setSelectedTableId(e.target.value); setInstallResult(null); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="">Choose a table...</option>
                    {tables.map(function(t) {
                      var installed = isFeatureInstalled(selectedAddOn!.featureKey!, t.id);
                      return <option key={t.id} value={t.id}>{(t.icon || '📊') + ' ' + t.name + (installed ? ' ✓ installed' : '')}</option>;
                    })}
                  </select>

                  {/* Booking System custom config */}
                  {selectedAddOn.customInstall && selectedTableId && !isFeatureInstalled(selectedAddOn.featureKey, selectedTableId) && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                      <h4 className="text-xs font-bold text-blue-900 uppercase">Configure Booking Columns</h4>
                      <p className="text-[10px] text-blue-700">These system columns will be added to your table. You can rename them.</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-medium text-blue-800 mb-1">Start Column</label>
                          <input type="text" value={bookingStartName} onChange={function(e) { setBookingStartName(e.target.value); }}
                            className="w-full px-2 py-1.5 text-xs border border-blue-300 rounded bg-white text-gray-900 focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-blue-800 mb-1">End Column</label>
                          <input type="text" value={bookingEndName} onChange={function(e) { setBookingEndName(e.target.value); }}
                            className="w-full px-2 py-1.5 text-xs border border-blue-300 rounded bg-white text-gray-900 focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-blue-800 mb-1">Resource Column</label>
                          <input type="text" value={bookingResourceName} onChange={function(e) { setBookingResourceName(e.target.value); }}
                            className="w-full px-2 py-1.5 text-xs border border-blue-300 rounded bg-white text-gray-900 focus:ring-1 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-blue-800 mb-1">Resources (comma-separated)</label>
                        <input type="text" value={bookingResources} onChange={function(e) { setBookingResources(e.target.value); }}
                          placeholder="e.g., Conference Room A, Gym, Auditorium, Vehicle 1"
                          className="w-full px-2 py-1.5 text-xs border border-blue-300 rounded bg-white text-gray-900 focus:ring-1 focus:ring-blue-500" />
                        <p className="text-[9px] text-blue-600 mt-0.5">You can add more resources later through the column settings.</p>
                      </div>
                    </div>
                  )}

                  {selectedTableId && (
                    <div className="mt-3 flex space-x-2">
                      {isFeatureInstalled(selectedAddOn.featureKey, selectedTableId) ? (
                        <button onClick={handleUninstall} disabled={installing}
                          className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                          {installing ? 'Removing...' : 'Remove from Table'}
                        </button>
                      ) : (
                        <button onClick={handleInstall} disabled={installing}
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          {installing ? 'Installing...' : selectedAddOn.customInstall ? 'Install Booking System' : 'Install on Table'}
                        </button>
                      )}
                    </div>
                  )}

                  {installResult && (
                    <div className={'mt-3 px-3 py-2 rounded-lg text-xs ' +
                      (installResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')}>
                      {installResult.message}
                    </div>
                  )}
                </div>
              )}

              {/* Coming soon */}
              {selectedAddOn.status === 'coming_soon' && (
                <div className="border-t border-gray-200 pt-4">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-500">This {selectedAddOn.type} is coming soon.</p>
                    <p className="text-xs text-gray-400 mt-1">It will be available in a future update.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}