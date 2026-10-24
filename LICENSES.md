# Phaedra licenses and source

Phaedra is a modified derivative of [Ardour](https://ardour.org/).
It is **not** an independently written audio engine.

The application includes Ardour code licensed under the GNU General Public
License, version 2 or (at your option) any later version. See [COPYING](COPYING)
for the license text and the Ardour plugin clarification. Preserve all
upstream copyright notices in the source files. Phaedra modifications are
distributed under compatible terms. The license does not grant trademarks.

The packaged Windows binaries can also contain separately licensed
libraries, fonts, audio processing code, VST support components, and
third-party plugins. See upstream source file headers and, in the
portable distribution, the licenses/third-party directory copied from
the build environment. Each component retains its own terms.

Every official binary release must provide:
* a precise source commit and build instructions (SOURCE.txt, README.md);
* the entire corresponding source for the code included, with the
  build/packaging scripts and license notices;
* a source archive from the very same tagged commit as the binary;
* the UCRT64 dependency package/version inventory (BUILD-DEPENDENCIES.txt).

A link to a source archive is for convenience. Distributors must also
review GPL source-offer obligations and source availability under the
applicable distribution model. Do not delete notices or misrepresent
upstream contributions.
