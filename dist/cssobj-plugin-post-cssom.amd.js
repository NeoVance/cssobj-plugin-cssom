define('cssobj_plugin_post_cssom', function () { 'use strict';

  // plugin for cssobj

  function dashify (str) {
    return str
      .replace(/([A-Z])/g, function (m) {return '-' + m.toLowerCase()})
  }

  function createDOM (id, option) {
    var el = document.createElement('style')
    document.getElementsByTagName('head')[0].appendChild(el)
    el.setAttribute('id', id)
    if (option && typeof option == 'object' && option.attrs)
      for (var i in option.attrs) {
        el.setAttribute(i, option.attrs[i])
      }
    return el
  }

  var addCSSRule = function (parent, selector, body, selPart) {
    var rules = parent.cssRules || parent.rules
    var pos = rules.length
    var omArr = []
    if ('insertRule' in parent) {
      parent.insertRule(selector + '{' + body + '}', pos)
    } else if ('addRule' in parent) {
      try {
        [].concat(selPart || selector).forEach(function (v) {
          parent.addRule(v, body, pos)
        })
      } catch(e) {
        // console.log(e, selector, body)
      }
    }

    for (var i = pos, len = rules.length; i < len; i++) {
      omArr.push(rules[i])
    }
    return omArr
  }

  function getBodyCss (prop) {
    // get cssText from prop
    return Object.keys(prop).map(function (k) {
      for (var v, ret = '', i = prop[k].length; i--;) {
        v = prop[k][i]
        ret += k.charAt(0) == '@'
          ? dashify(k) + ' ' + v + ';'
          : dashify(k) + ': ' + v + ';'
      }
      return ret
    }).join('')
  }

  function cssobj_plugin_post_cssom (option) {
    option = option || {}

    if (!option.name) option.name = +new Date()
    option.name += ''

    var id = 'style_cssobj_' + option.name.replace(/[^a-zA-Z0-9$_]/g, '')

    var dom = document.getElementById(id) || createDOM(id, option)
    var sheet = dom.sheet || dom.styleSheet

    // helper regexp & function
    var reWholeRule = /keyframes|page/i
    var atomGroupRule = function (node) {
      return !node ? false : reWholeRule.test(node.at) || node.parentRule && reWholeRule.test(node.parentRule.at)
    }

    var getParent = function (node) {
      var p = node.parentRule
      return p && p.omGroup || sheet
    }

    var sugar = function (str) {
      return option.noSugar ? str : str
        .replace(/>=/g, 'min-width:')
        .replace(/<=/g, 'max-width:')
    }

    var validParent = function (node) {
      return !node.parentRule || node.parentRule.omGroup !== null
    }

    var removeRule = function (node) {
      node.omRule && node.omRule.forEach(function (rule) {
        var parent = rule.parentRule || sheet
        var rules = parent.cssRules || parent.rules
        var index = -1
        for (var i = 0, len = rules.length; i < len; i++) {
          if (rules[i] === rule) {
            index = i
            break
          }
        }
        if (index < 0) return
        parent.removeRule
          ? parent.removeRule(index)
          : parent.deleteRule(index)
      })
      delete node.omRule
    }

    // helper function for addNormalrule
    var addNormalRule = function (node, selText, cssText, selPart) {
      // get parent to add
      var parent = getParent(node)
      if (validParent(node))
        node.omRule = addCSSRule(parent, selText, cssText, selPart)
      else if (node.parentRule) {
        if (node.parentRule.mediaEnabled) {
          if (!node.omRule) node.omRule = addCSSRule(parent, selText, cssText, selPart)
        }else if (node.omRule) {
          removeRule(node)
        }
      }
    }

    var mediaStore = []

    var checkMediaList = function () {
      mediaStore.forEach(function (v) {
        v.mediaEnabled = v.mediaTest()
        walk(v)
      })
    }

    if (window.attachEvent) {
      window.attachEvent('onresize', checkMediaList)
    } else if (window.addEventListener) {
      window.addEventListener('resize', checkMediaList, true)
    }

    var walk = function (node, store) {
      if (!node) return

      // cssobj generate vanilla Array, it's safe to use constructor, fast
      if (node.constructor === Array) return node.map(function (v) {walk(v, store)})

      var postArr = []
      var children = node.children
      var isGroup = node.type == 'group'

      if (atomGroupRule(node)) store = store || []

      if (isGroup) {
        // if it's not @page, @keyframes (which is not groupRule in fact)
        if (!atomGroupRule(node)) {
          var reAdd = 'omGroup' in node
          node.omGroup = addCSSRule(sheet, sugar(node.groupText), '{}').pop() || null

          // when add media rule failed, build test function then check on window.resize
          if (node.at == 'media' && !reAdd && !node.omGroup) {
            // build test function from @media rule
            var mediaTest = new Function(
              'return ' + node.groupText
                .replace(/@media\s*/i, '')
                .replace(/min-width:/ig, '>=')
                .replace(/max-width:/ig, '<=')
                .replace(/px\s*\)/ig, ')')
                .replace(/\s+and\s+/ig, '&&')
                .replace(/,/g, '||')
                .replace(/\(/g, '(document.documentElement.offsetWidth')
            )

            try {
              // first test if it's valid function
              mediaTest()
              node.mediaTest = mediaTest
              mediaStore.push(node)
            } catch(e) {}
          }
        }
      }

      var selText = node.selText
      var cssText = getBodyCss(node.prop)

      // it's normal css rule
      if (cssText) {
        if (!atomGroupRule(node)) {
          addNormalRule(node, selText, cssText, node.selPart)
        }
        store && store.push(selText ? selText + ' {' + cssText + '}' : cssText)
      }

      for (var c in children) {
        // emtpy key rule and media rule should add in top level, walk later
        if (c === '' || children[c].at == 'media') postArr.push(c)
        else walk(children[c], store)
      }

      if (isGroup) {
        // if it's @page, @keyframes
        if (atomGroupRule(node) && validParent(node)) {
          addNormalRule(node, node.groupText, store.join(''))
          store = null
        }
      }

      // media rules need a stand alone block
      postArr.map(function (v) {
        walk(children[v], store)
      })
    }

    return function (result) {
      if (!result.diff) {
        // it's first time render
        walk(result.root)
      } else {
        // it's not first time, patch the diff result to CSSOM
        var diff = result.diff

        // node added
        if (diff.added) diff.added.forEach(function (node) {
          walk(node)
        })

        // node removed
        if (diff.removed) diff.removed.forEach(function (node) {
          removeRule(node)
        })

        // node changed, find which part should be patched
        if (diff.changed) diff.changed.forEach(function (node) {
          var om = node.omRule
          var diff = node.diff

          if (!om) return

          // added have same action as changed, can be merged... just for clarity
          diff.added && diff.added.forEach(function (v) {
            om && om.forEach(function (rule) {
              rule.style[v] = node.prop[v][0]
            })
          })

          diff.changed && diff.changed.forEach(function (v) {
            om && om.forEach(function (rule) {
              rule.style[v] = node.prop[v][0]
            })
          })

          diff.removed && diff.removed.forEach(function (v) {
            om && om.forEach(function (rule) {
              rule.style.removeProperty
                ? rule.style.removeProperty(v)
                : rule.style.removeAttribute(v)
            })
          })
        })
      }

      return result
    }
  }

  return cssobj_plugin_post_cssom;

});