/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { Cc, Ci, Cr, Cm, components: { classesByID } } = require('chrome');
const { registerFactory, unregisterFactory, isCIDRegistered } =
      Cm.QueryInterface(Ci.nsIComponentRegistrar);

const { Base } = require('./base');
const { uuid } = require('./uuid');

// This is a base prototype, that provides bare bones of XPCOM. JS based
// components can be easily implement by extending it.
const Unknown = Base.extend({
  // Method `extend` is overridden so that resulting object will contain
  // `interfaces` array property, containing elements from ancestor and all
  // provided sources.
  extend: function extend() {
    let args = Array.slice(arguments);
    return Base.extend.apply(this, args.concat([{
      interfaces: args.reduce(function(interfaces, source) {
        // If given source has `interfaces` property concatenate it's elements
        // them resulting `interfaces` array, otherwise return resulting
        // `interfaces` array.
        return 'interfaces' in source ? source.interfaces.concat(interfaces)
                                      : interfaces;
      }, this.interfaces)
    }]));
  },
  /**
   * The `QueryInterface` method provides runtime type discovery used by XPCOM.
   * This method return quired instance of `this` if given `iid` is listed in
   * the `interfaces` property.
   */
  QueryInterface: function QueryInterface(iid) {
    // For some reason there are cases when `iid` is `null`. In such cases we
    // just return `this`. Otherwise we verify that component implements given
    // `iid` interface.
    if (iid && !this.interfaces.some(function(id) iid.equals(Ci[id])))
      throw Cr.NS_ERROR_NO_INTERFACE;
    return this;
  },
  /**
   * Array of `XPCOM` interfaces (as strings) implemented by this component. All
   * components implement `nsISupports` by default which is default value here.
   * Provide array of interfaces implemented by an object when extending, to
   * append them to this list (Please note that there is no need to repeat
   * interfaces implemented by super as they will be added automatically).
   */
  interfaces: [ 'nsISupports' ]
});
exports.Unknown = Unknown;

// Base exemplar for creating instances implementing `nsIFactory` interface,
// that maybe registered into runtime via `register` function. Instances of
// this factory create instances of enclosed component on `createInstance`.
const Factory = Unknown.extend({
  interfaces: [ 'nsIFactory' ],
  /**
   * All the descendants will get auto generated `id` (also known as `classID`
   * in XPCOM world) unless one is manually provided.
   */
  get id() { throw Error('Factory must implement `id` property') },
  /**
   * XPCOM `contractID` may optionally  be provided to associate this factory
   * with it. `contract` is a unique string that has a following format:
   * '@vendor.com/unique/id;1'.
   */
  contract: null,
  /**
   * Class description that is being registered. This value is intended as a
   * human-readable description for the given class and does not needs to be
   * globally unique.
   */
  description: 'Jetpack generated factory',
  /**
   * This method is required by `nsIFactory` interfaces, but as in most
   * implementations it does nothing interesting.
   */
  lockFactory: function lockFactory(lock) undefined,
  /**
   * If property is `true` XPCOM service / factory will be registered
   * automatically on creation.
   */
  register: true,
  /**
   * If property is `true` XPCOM factory will be unregistered prior to add-on
   * unload.
   */
  unregister: true,
  /**
   * Method is called on `Service.new(options)` passing given `options` to
   * it. Options is expected to have `component` property holding XPCOM
   * component implementation typically decedent of `Unknown` or any custom
   * implementation with a `new` method and optional `register`, `unregister`
   * flags. Unless `register` is `false` Service / Factory will be
   * automatically registered. Unless `unregister` is `false` component will
   * be automatically unregistered on add-on unload.
   */
  initialize: function initialize(options) {
    options = options || {}
    this.merge(options, { id: 'id' in options && options.id || uuid() });

    // If service / factory has auto registration enabled then register.
    if (this.register)
      register(this);
  },
  /**
   * Creates an instance of the class associated with this factory.
   */
  createInstance: function createInstance(outer, iid) {
    try {
      if (outer)
        throw Cr.NS_ERROR_NO_AGGREGATION;
      return this.create().QueryInterface(iid);
    }
    catch (error) {
      throw error instanceof Ci.nsIException ? error : Cr.NS_ERROR_FAILURE;
    }
  },
  create: function create() this.component.new()
});
exports.Factory = Factory;

// Exemplar for creating services that implement `nsIFactory` interface, that
// can be registered into runtime via call to `register`. This services return
// enclosed `component` on `getService`.
const Service = Factory.extend({
  description: 'Jetpack generated service',
  /**
   * Creates an instance of the class associated with this factory.
   */
  create: function create() this.component
});
exports.Service = Service;

function isRegistered({ id }) isCIDRegistered(id)
exports.isRegistered = isRegistered;

/**
 * Registers given `component` object to be used to instantiate a particular
 * class identified by `component.id`, and creates an association of class
 * name and `component.contract` with the class.
 */
function register(factory) {
  registerFactory(factory.id, factory.description, factory.contract, factory);

  if (factory.unregister)
    require('./unload').when(unregister.bind(null, factory));
}
exports.register = register;

/**
 * Unregister a factory associated with a particular class identified by
 * `factory.classID`.
 */
function unregister(factory) {
  if (isRegistered(factory))
    unregisterFactory(factory.id, factory);
}
exports.unregister = unregister;

function autoRegister(path) {
  // TODO: This assumes that the url points to a directory
  // that contains subdirectories corresponding to OS/ABI and then
  // further subdirectories corresponding to Gecko platform version.
  // we should probably either behave intelligently here or allow
  // the caller to pass-in more options if e.g. there aren't
  // Gecko-specific binaries for a component (which will be the case
  // if only frozen interfaces are used).

  var runtime = require("./runtime");
  var osDirName = runtime.OS + "_" + runtime.XPCOMABI;
  var platformVersion = require("./xul-app").platformVersion.substring(0, 5);

  var file = Cc['@mozilla.org/file/local;1']
             .createInstance(Ci.nsILocalFile);
  file.initWithPath(path);
  file.append(osDirName);
  file.append(platformVersion);

  if (!(file.exists() && file.isDirectory()))
    throw new Error("component not available for OS/ABI " +
                    osDirName + " and platform " + platformVersion);

  Cm.QueryInterface(Ci.nsIComponentRegistrar);
  Cm.autoRegister(file);
}
exports.autoRegister = autoRegister;

/**
 * Returns registered factory that has a given `id` or `null` if not found.
 */
function factoryByID(id) classesByID[id] || null
exports.factoryByID = factoryByID;

/**
 * Returns factory registered with a given `contract` or `null` if not found.
 * In contrast to `Cc[contract]` that does ignores new factory registration
 * with a given `contract` this will return a factory currently associated
 * with a `contract`.
 */
function factoryByContract(contract) factoryByID(Cm.contractIDToCID(contract))
exports.factoryByContract = factoryByContract;
