import { ViewPlugin } from '@remixproject/engine-web'
import { PluginManagerSettings } from './plugin-manager-settings'
import React from 'react' // eslint-disable-line
import ReactDOM from 'react-dom'
import {RemixUiPluginManager} from '@remix-ui/plugin-manager' // eslint-disable-line
import * as packageJson from '../../../../../package.json'
const _paq = window._paq = window._paq || []

const profile = {
  name: 'pluginManager',
  displayName: 'Plugin manager',
  methods: [],
  events: [],
  icon: 'assets/img/pluginManager.webp',
  description: 'Start/stop services, modules and plugins',
  kind: 'settings',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/plugin_manager.html',
  version: packageJson.version
}

class PluginManagerComponent extends ViewPlugin {
  constructor (appManager, engine) {
    super(profile)
    this.appManager = appManager
    this.engine = engine
    this.pluginManagerSettings = new PluginManagerSettings()
    this.htmlElement = document.createElement('div')
    this.htmlElement.setAttribute('id', 'pluginManager')
    this.filter = ''

    this.activePlugins = []
    this.inactivePlugins = []
    this.activeProfiles = this.appManager.actives
    this._paq = _paq
    this.listenOnEvent()
  }

  /**
   * Checks and returns true or false if plugin name
   * passed in exists in the actives string array in
   * RemixAppManager
   * @param {string} name name of Plugin
   */
  isActive (name) {
    return this.appManager.actives.includes(name)
  }

  /**
   * Delegates to method activatePlugin in
   * RemixAppManager to enable plugin activation
   * @param {string} name name of Plugin
   */
  async activateP (name) {
    try {
      await this.appManager.activatePlugin(name)
    } catch (e) {
      if (e.message.includes('plugin is already rendered')) {
        // force app manager to have this plugin as active, remove the view by deactivating and try to reactivate
        if (!await this.appManager.isActive(name)) this.appManager.actives.push(name)
        await this.appManager.deactivatePlugin(name)
        await this.appManager.activatePlugin(name)
      }
    }
    this.getAndFilterPlugins()
    _paq.push(['trackEvent', 'manager', 'activate', name])
  }

  /**
   * Takes the name of a local plugin and does both
   * activation and registration
   * @param {Profile} pluginName
   * @returns {void}
   */
  async activateAndRegisterLocalPlugin (localPlugin) {
    if (localPlugin) {
      try {
        this.engine.register(localPlugin)
      } catch (e) {}
      await this.activateP(localPlugin.profile.name)
      localStorage.setItem('plugins/local', JSON.stringify(localPlugin.profile))
    }
  }

  /**
   * Calls and triggers the event deactivatePlugin
   * with with manager permission passing in the name
   * of the plugin
   * @param {string} name name of Plugin
   */
  async deactivateP (name) {
    await this.call('manager', 'deactivatePlugin', name)
    _paq.push(['trackEvent', 'manager', 'deactivate', name])
  }

  async removeP (name) {
    const profile = await this.appManager.getProfile(name)
    // try to remove it from the host view first
    try {
      if (profile) await this.call(profile.location, 'removeView', profile)
    } catch (e) {}

    // removing from the engine also deactivates it, but sometimes it can't remove it from the view if the handshake didn't succeed
    try {
      await this.engine.remove(name)
    } catch (e) {}

    // also clean up the app manager
    await this.appManager.removeProfile(name)
  }

  onActivation () {
    this.renderComponent()
  }

  renderComponent () {
    ReactDOM.render(
      <RemixUiPluginManager
        pluginComponent={this}
        pluginManagerSettings={this.pluginManagerSettings}
      />,
      this.htmlElement)
  }

  render () {
    return this.htmlElement
  }

  getAndFilterPlugins (filter) {
    this.filter = typeof filter === 'string' ? filter.toLowerCase() : this.filter

    const isFiltered = (profile) => (profile.displayName ? profile.displayName : profile.name).toLowerCase().includes(this.filter)
    const isNotRequired = (profile) => !this.appManager.isRequired(profile.name)
    const isNotDependent = (profile) => !this.appManager.isDependent(profile.name)
    const isNotHome = (profile) => profile.name !== 'home'
    const sortByName = (profileA, profileB) => {
      const nameA = ((profileA.displayName) ? profileA.displayName : profileA.name).toUpperCase()
      const nameB = ((profileB.displayName) ? profileB.displayName : profileB.name).toUpperCase()
      return (nameA < nameB) ? -1 : (nameA > nameB) ? 1 : 0
    }
    const activatedPlugins = []
    const deactivatedPlugins = []
    const tempArray = this.appManager.getAll()
      .filter(isFiltered)
      .filter(isNotRequired)
      .filter(isNotDependent)
      .filter(isNotHome)
      .sort(sortByName)

    tempArray.forEach(profile => {
      if (this.appManager.actives.includes(profile.name)) {
        activatedPlugins.push(profile)
      } else {
        deactivatedPlugins.push(profile)
      }
    })
    this.activePlugins = activatedPlugins
    this.inactivePlugins = deactivatedPlugins
    this.renderComponent()
  }

  listenOnEvent () {
    this.engine.event.on('onRegistration', () => this.renderComponent())
    this.appManager.event.on('activate', () => {
      this.getAndFilterPlugins()
    })
    this.appManager.event.on('deactivate', () => {
      this.getAndFilterPlugins()
    })
  }
}

module.exports = PluginManagerComponent
