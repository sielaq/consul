import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import { assign } from '@ember/polyfills';

import { hash } from 'rsvp';
import { get } from '@ember/object';
import transitionToNearestParent from 'consul-ui/utils/transitionToNearestParent';

export default Route.extend({
  repo: service('kv'),
  sessionRepo: service('session'),
  model: function(params) {
    const key = params.key;
    const dc = this.modelFor('dc').dc;
    const parentKeys = this.getParentAndGrandparent(key);
    const repo = this.get('repo');
    // Return a promise hash to get the data for both columns

    // keys and key are requested in series to avoid
    // ember not being able to merge the responses
    return hash({
      // better name, slug vs key?
      keys: repo.findAllBySlug(parentKeys.parent, dc),
      isLoading: false,
    })
      .then(function(model) {
        return hash(
          assign({}, model, {
            key: repo.findBySlug(key, dc),
          })
        );
      })
      .then(model => {
        // jc: another afterModel for no reason replacement
        // guessing ember-data will come in here, as we are just stitching stuff together
        const session = model.key.get('Session');
        if (session) {
          return hash(
            assign({}, model, {
              session: this.get('sessionRepo').findByKey(session, model.dc),
            })
          );
        } else {
          return assign({}, model, {
            session: '',
          });
        }
      })
      .then(model => {
        // TODO: again as in show, look at tidying this up
        const key = model.key;
        const parentKeys = this.getParentAndGrandparent(get(key, 'Key'));
        return assign(model, {
          keys: this.removeDuplicateKeys(model.keys.toArray(), parentKeys.parent),
          model: key,
          parentKey: parentKeys.parent,
          grandParentKey: parentKeys.grandParent,
          siblings: model.keys,
          session: model.session,
        });
      });
  },
  setupController: function(controller, model) {
    controller.setProperties(model);
  },
  actions: {
    update: function(key) {
      this.get('feedback').execute(
        () => {
          key.set('Value', get(key, 'valueDecoded'));
          return this.get('repo').persist(key, this.modelFor('dc').dc);
        },
        `Updated ${key.get('Key')}`,
        `There was an error updating ${key.get('Key')}`
      );
    },
    delete: function(key) {
      this.get('feedback').execute(
        () => {
          const dc = this.modelFor('dc').dc;
          const parentKeys = this.getParentAndGrandparent(get(key, 'Key'));
          return this.get('repo')
            .remove(
              {
                Key: key.get('Key'),
              },
              dc
            )
            .then(() => {
              const rootKey = this.get('rootKey');
              return transitionToNearestParent.bind(this)(
                dc,
                parentKeys.isRoot ? rootKey : parentKeys.parent,
                rootKey
              );
            });
        },
        `Deleted ${key.get('Key')}`,
        `There was an error deleting ${key.get('Key')}`
      );
    },
    cancel: function(key) {
      const controller = this.controller;
      // TODO: I've already done this once
      const parentKeys = this.getParentAndGrandparent(get(key, 'Key'));
      controller.set('isLoading', true); // check before removing these
      // could probably do with a better notification
      this.transitionTo('dc.kv.show', parentKeys.isRoot ? this.get('rootKey') : parentKeys.parent);
      controller.set('isLoading', false);
    },
  },
});
